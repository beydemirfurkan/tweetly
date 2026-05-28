import { NotFoundException } from '@nestjs/common';
import { ActionQueueHandler } from '../action-queue.handler';
import { fakeContext } from './test-helpers';
import type { ActionQueueService } from '@/action-engine/application/action-queue.service';

function build() {
  const queue = {
    listActions: jest.fn().mockResolvedValue([]),
    cancelAction: jest.fn().mockResolvedValue(true),
    replayAction: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<ActionQueueService>;
  return { handler: new ActionQueueHandler(queue), queue };
}

describe('ActionQueueHandler.listActions', () => {
  it('throws on unknown action type', async () => {
    const { handler } = build();
    await expect(handler.listActions({ type: 'bogus' }, fakeContext())).rejects.toThrow(/type must be one of/);
  });

  it('returns empty rows when the user has no accounts (defensive)', async () => {
    const ctx = fakeContext({ userAccountIdSet: jest.fn().mockResolvedValue(new Set()) });
    const { handler } = build();
    const result = await handler.listActions({ type: 'post' }, ctx);
    expect(result).toEqual({ type: 'post', count: 0, rows: [] });
  });

  it('blocks queries against accounts the user does not own', async () => {
    const ctx = fakeContext({ userAccountIdSet: jest.fn().mockResolvedValue(new Set(['acc-1'])) });
    const { handler } = build();
    await expect(handler.listActions({ type: 'post', account_id: 'foreign' }, ctx)).rejects.toThrow(/foreign/);
  });

  it('filters rows by allowedIds when no account_id is given', async () => {
    const { handler, queue } = build();
    queue.listActions.mockResolvedValue([
      { id: 'r1', account_id: 'acc-1' },
      { id: 'r2', account_id: 'foreign' },
    ] as never);
    const ctx = fakeContext({ userAccountIdSet: jest.fn().mockResolvedValue(new Set(['acc-1'])) });

    const result = await handler.listActions({ type: 'post' }, ctx);

    expect(result.count).toBe(1);
    expect(result.rows[0].id).toBe('r1');
  });
});

describe('ActionQueueHandler.cancelAction / replayAction', () => {
  it('cancelAction asserts ownership before mutating', async () => {
    const ctx = fakeContext({
      assertActionOwnership: jest.fn().mockRejectedValue(new NotFoundException('Action a not found')),
    });
    const { handler, queue } = build();

    await expect(handler.cancelAction({ type: 'post', action_id: 'a' }, ctx)).rejects.toThrow(NotFoundException);
    expect(queue.cancelAction).not.toHaveBeenCalled();
  });

  it('replayAction returns ok+pending on success', async () => {
    const { handler } = build();
    const result = await handler.replayAction({ type: 'post', action_id: 'a' }, fakeContext());
    expect(result).toEqual({ ok: true, id: 'a', status: 'pending' });
  });
});
