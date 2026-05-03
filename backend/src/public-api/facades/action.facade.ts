import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActionEnqueueService } from '@/action-engine/action-enqueue.service';
import { AdminApiService } from '@/admin-api/admin-api.service';
import type { ActionType, ActionStatus } from '@domain/types/action.types';
import { ACTION_TYPES } from '@domain/types/action.types';
import { AccountFacade } from './account.facade';
import type {
  FollowBody,
  InteractionBody,
  PostActionBody,
  QuoteActionBody,
  ReplyActionBody,
  ThreadBody,
} from '../dto/action.dto';

/**
 * Wraps ActionEnqueueService + AdminApiService with ownership / idempotency
 * concerns so that controllers stay declarative. Resolution helpers come
 * from AccountFacade — ownership lives in one place.
 */
@Injectable()
export class ActionFacade {
  constructor(
    private readonly enqueue: ActionEnqueueService,
    private readonly admin: AdminApiService,
    private readonly accountFacade: AccountFacade,
  ) {}

  async enqueuePost(userId: string, body: PostActionBody) {
    if (!body.text) throw new BadRequestException('text is required');
    const accountId = await this.accountFacade.resolveAccountId(userId, body.account);
    return this.enqueue.enqueuePost({
      accountId,
      text: body.text,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  async enqueueReply(userId: string, body: ReplyActionBody) {
    if (!body.text) throw new BadRequestException('text is required');
    if (!body.parentTweetUrl?.includes('/status/')) {
      throw new BadRequestException('parentTweetUrl must contain /status/');
    }
    const accountId = await this.accountFacade.resolveAccountId(userId, body.account);
    return this.enqueue.enqueueReply({
      accountId,
      text: body.text,
      parentTweetUrl: body.parentTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  async enqueueLike(userId: string, body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const accountId = await this.accountFacade.resolveAccountId(userId, body.account);
    return this.enqueue.enqueueLike({
      accountId,
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  async enqueueRetweet(userId: string, body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const accountId = await this.accountFacade.resolveAccountId(userId, body.account);
    return this.enqueue.enqueueRetweet({
      accountId,
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  async enqueueQuote(userId: string, body: QuoteActionBody) {
    if (!body.text) throw new BadRequestException('text is required');
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const accountId = await this.accountFacade.resolveAccountId(userId, body.account);
    return this.enqueue.enqueueQuote({
      accountId,
      text: body.text,
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  async enqueueBookmark(userId: string, body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const accountId = await this.accountFacade.resolveAccountId(userId, body.account);
    return this.enqueue.enqueueBookmark({
      accountId,
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  async enqueueFollow(userId: string, body: FollowBody) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    const accountId = await this.accountFacade.resolveAccountId(userId, body.account);
    return this.enqueue.enqueueFollow({
      accountId,
      targetHandle: body.targetHandle,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  async enqueueThread(userId: string, body: ThreadBody) {
    if (!Array.isArray(body.tweets) || body.tweets.length === 0) {
      throw new BadRequestException('tweets must be a non-empty array');
    }
    const accountId = await this.accountFacade.resolveAccountId(userId, body.account);
    const now = new Date();
    const results: Array<{ index: number; id: string | null }> = [];
    for (let i = 0; i < body.tweets.length; i++) {
      const r = await this.enqueue.enqueuePost({
        accountId,
        text: body.tweets[i],
        scheduledAt: new Date(now.getTime() + i * 5000),
        metadata: { source: 'rest-thread', threadIndex: i, threadLength: body.tweets.length },
      });
      results.push({ index: i, id: r.id });
    }
    return { enqueued: results.length, actions: results };
  }

  async listForUser(
    userId: string,
    type: string | undefined,
    status: string | undefined,
    accountId: string | undefined,
    limitStr: string | undefined,
  ) {
    if (!type || !ACTION_TYPES.includes(type as ActionType)) {
      throw new BadRequestException(`type must be one of: ${ACTION_TYPES.join(', ')}`);
    }
    const allowed = new Set(await this.accountFacade.userAccountIds(userId));
    if (allowed.size === 0) return { type, count: 0, rows: [] };
    if (accountId && !allowed.has(accountId)) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
    const limit = Math.min(Math.max(1, parseInt(limitStr ?? '50', 10)), 200);
    const rows = await this.admin.listActions(
      type as ActionType,
      status as ActionStatus | undefined,
      accountId || undefined,
      limit,
    );
    const filtered = accountId ? rows : rows.filter((r) => allowed.has(r.account_id));
    return { type, count: filtered.length, rows: filtered };
  }

  async cancel(userId: string, type: string, id: string) {
    const t = this.requireKnownType(type);
    await this.assertActionOwnership(userId, t, id);
    const ok = await this.admin.cancelAction(t, id);
    if (!ok) throw new NotFoundException(`Action ${id} not found or not cancellable`);
    return { ok: true, id, status: 'cancelled' };
  }

  async replay(userId: string, type: string, id: string) {
    const t = this.requireKnownType(type);
    await this.assertActionOwnership(userId, t, id);
    const ok = await this.admin.replayAction(t, id);
    if (!ok) throw new NotFoundException(`Action ${id} not found or not replayable`);
    return { ok: true, id, status: 'pending' };
  }

  private requireKnownType(type: string): ActionType {
    if (!ACTION_TYPES.includes(type as ActionType)) {
      throw new BadRequestException(`Unknown action type: ${type}`);
    }
    return type as ActionType;
  }

  private async assertActionOwnership(userId: string, type: ActionType, id: string): Promise<void> {
    const accountId = await this.admin.findActionAccountId(type, id);
    if (!accountId) throw new NotFoundException(`Action ${id} not found`);
    await this.accountFacade.assertAccountOwnership(userId, accountId);
  }
}
