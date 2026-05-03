import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AccountsService } from '../../../src/accounts/accounts.service';
import { MonitoringService } from '../../../src/monitoring/monitoring.service';
import { ActionEnqueueService } from '../../../src/action-engine/action-enqueue.service';
import { McpService } from '../../../src/mcp/mcp.service';
import { MonitorHandler } from '../../../src/mcp/handlers/monitor.handler';
import { AccountHandler } from '../../../src/mcp/handlers/account.handler';
import type { McpToolContext } from '../../../src/mcp/handlers/mcp-tool.context';
import { IntegrationDbHarness } from '../harness';

/**
 * Cross-tenant authz: user-A must never see, mutate, or destroy user-B's
 * resources, regardless of which MCP tool is invoked. The contexts here
 * are built through the real McpService.buildContext path so the guards
 * (assertAccountOwnership, userAccountIdSet, findByIdForUser) are
 * exercised against the real DB rather than mocks.
 */

describe('cross-tenant authz', () => {
  let harness: IntegrationDbHarness;
  let app: INestApplication;
  let mcp: McpService;
  let accounts: AccountsService;
  let monitoring: MonitoringService;
  let enqueue: ActionEnqueueService;
  let monitorHandler: MonitorHandler;
  let accountHandler: AccountHandler;

  let userA = '';
  let userB = '';
  const accountAId = 'acc-a';
  const accountBId = 'acc-b';

  // McpService.buildContext is private; expose it through a small helper
  // that mirrors what dispatch would do for a given user.
  function ctxFor(userId: string): McpToolContext {
    return (mcp as unknown as { buildContext(uid: string): McpToolContext }).buildContext(userId);
  }

  beforeAll(async () => {
    harness = new IntegrationDbHarness();
    await harness.start();
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    mcp = app.get(McpService);
    accounts = app.get(AccountsService);
    monitoring = app.get(MonitoringService);
    enqueue = app.get(ActionEnqueueService);
    monitorHandler = app.get(MonitorHandler);
    accountHandler = app.get(AccountHandler);

    // Two independent users, each with one account.
    const [{ id: uA }] = await harness.dataSource.query(
      `INSERT INTO users (email, status) VALUES ('a@test.local', 'active') RETURNING id`,
    );
    const [{ id: uB }] = await harness.dataSource.query(
      `INSERT INTO users (email, status) VALUES ('b@test.local', 'active') RETURNING id`,
    );
    userA = uA;
    userB = uB;

    await harness.dataSource.query(
      `INSERT INTO accounts (id, user_id, display_name, auth_token, status, created_at)
       VALUES ($1, $2, 'A', 'tok', 'active', now()), ($3, $4, 'B', 'tok', 'active', now())`,
      [accountAId, userA, accountBId, userB],
    );
  }, 90_000);

  afterAll(async () => {
    if (app) await app.close();
    if (harness) await harness.stop();
  });

  describe('AccountsService boundary', () => {
    it('findByIdForUser returns null when the account belongs to another user', async () => {
      const found = await accounts.findByIdForUser(accountBId, userA);
      expect(found).toBeNull();
    });

    it('listAllForUser only returns the caller-owned accounts', async () => {
      const aList = await accounts.listAllForUser(userA);
      const bList = await accounts.listAllForUser(userB);
      expect(aList.map((a) => a.id)).toEqual([accountAId]);
      expect(bList.map((a) => a.id)).toEqual([accountBId]);
    });

    it('listActiveForUser is also user-scoped', async () => {
      const list = await accounts.listActiveForUser(userA);
      expect(list.map((a) => a.id)).toEqual([accountAId]);
    });
  });

  describe('McpToolContext.resolveAccountId', () => {
    it('rejects an explicit account_id that the caller does not own', async () => {
      const ctx = ctxFor(userA);
      await expect(ctx.resolveAccountId(accountBId)).rejects.toThrow(NotFoundException);
    });

    it('accepts the caller-owned account_id', async () => {
      const ctx = ctxFor(userA);
      await expect(ctx.resolveAccountId(accountAId)).resolves.toBe(accountAId);
    });

    it('falls back to the first active *owned* account when no id is given', async () => {
      const ctx = ctxFor(userA);
      await expect(ctx.resolveAccountId()).resolves.toBe(accountAId);
    });
  });

  describe('Monitor handler', () => {
    let monitorAId = '';

    beforeAll(async () => {
      const m = await monitoring.create({
        accountId: accountAId,
        targetHandle: 'someoneelse',
        webhookUrl: 'https://hook.test/a',
        eventTypes: ['tweet.new'],
      });
      monitorAId = m.id;
    });

    it('user-B cannot getMonitor on user-A\'s monitor (assertAccountOwnership trips)', async () => {
      await expect(
        monitorHandler.getMonitor({ monitor_id: monitorAId }, ctxFor(userB)),
      ).rejects.toThrow(NotFoundException);
    });

    it('user-B cannot deleteMonitor user-A\'s monitor', async () => {
      await expect(
        monitorHandler.deleteMonitor({ monitor_id: monitorAId }, ctxFor(userB)),
      ).rejects.toThrow(NotFoundException);
    });

    it('user-B cannot pauseMonitor user-A\'s monitor', async () => {
      await expect(
        monitorHandler.pauseMonitor({ monitor_id: monitorAId }, ctxFor(userB)),
      ).rejects.toThrow(NotFoundException);
    });

    it('listMonitors is user-scoped: user-B sees zero entries', async () => {
      const result = await monitorHandler.listMonitors({}, ctxFor(userB));
      expect(result).toEqual({ count: 0, monitors: [] });
    });

    it('listMonitors for the owner returns the monitor', async () => {
      const result = await monitorHandler.listMonitors({}, ctxFor(userA));
      expect(result.count).toBe(1);
      expect((result.monitors as Array<{ id: string }>)[0].id).toBe(monitorAId);
    });
  });

  describe('list_actions / cancel_action / replay_action', () => {
    it('list_actions for user-B never returns user-A\'s actions even when explicitly filtered', async () => {
      // Enqueue a post action for user-A's account
      await enqueue.enqueuePost({
        accountId: accountAId,
        text: 'visible to A only',
        scheduledAt: new Date(),
      });

      // user-B with no account_id filter: should see only their own (none)
      const bList = await accountHandler.listActions({ type: 'post' }, ctxFor(userB));
      expect(bList.count).toBe(0);

      // user-B explicitly tries user-A's account_id: must reject
      await expect(
        accountHandler.listActions({ type: 'post', account_id: accountAId }, ctxFor(userB)),
      ).rejects.toThrow(/not found/i);
    });

    it('cancel_action checks action ownership through the action\'s account', async () => {
      const { id } = await enqueue.enqueuePost({
        accountId: accountAId,
        text: 'cancellation candidate',
        scheduledAt: new Date(),
      });
      // user-B trying to cancel an action that belongs to user-A's account
      await expect(
        accountHandler.cancelAction({ type: 'post', action_id: id! }, ctxFor(userB)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Settings boundary', () => {
    it('updateSettings for user-A\'s account from user-B context throws', async () => {
      await expect(
        accountHandler.updateSettings(
          { account_id: accountAId, settings: { foo: 'bar' } },
          ctxFor(userB),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('getSettings for user-A\'s account from user-B context throws', async () => {
      await expect(
        accountHandler.getSettings({ account_id: accountAId }, ctxFor(userB)),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
