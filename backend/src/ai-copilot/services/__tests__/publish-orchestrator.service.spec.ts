import { BadRequestException } from '@nestjs/common';
import { PublishOrchestratorService } from '../publish-orchestrator.service';
import type { ActionEnqueueService, EnqueueResult } from '@/action-engine/action-enqueue.service';
import type { ContentMemoryService } from '@/content-memory/content-memory.service';

function makeOrchestrator(opts: {
  similarityReason?: string | null;
  enqueueResult?: EnqueueResult;
} = {}) {
  const enqueuePost = jest.fn().mockResolvedValue(
    opts.enqueueResult ?? ({ id: 'act-1', idempotencyKey: 'key-1' } as EnqueueResult),
  );
  const similarityReason = jest.fn().mockResolvedValue(opts.similarityReason ?? null);
  const add = jest.fn().mockResolvedValue(undefined);

  const enqueue = { enqueuePost } as unknown as jest.Mocked<ActionEnqueueService>;
  const contentMemory = { similarityReason, add } as unknown as jest.Mocked<ContentMemoryService>;
  const svc = new PublishOrchestratorService(enqueue, contentMemory);
  return { svc, enqueuePost, similarityReason, add };
}

describe('PublishOrchestratorService.publish', () => {
  it('rejects the publish with 400 when content memory flags a similar past post', async () => {
    const { svc, enqueuePost, add } = makeOrchestrator({
      similarityReason: 'high keyword overlap: owner/x',
    });

    await expect(svc.publish({ accountId: 'acc-1', text: 'duplicate text' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(enqueuePost).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('enqueues with now() when scheduledAt is not provided', async () => {
    const before = Date.now();
    const { svc, enqueuePost } = makeOrchestrator();
    await svc.publish({ accountId: 'acc-1', text: 'fresh text' });
    const call = enqueuePost.mock.calls[0][0];
    expect(call.accountId).toBe('acc-1');
    expect(call.text).toBe('fresh text');
    expect(call.scheduledAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.metadata).toEqual({ source: 'ai-copilot' });
  });

  it('uses the provided scheduledAt when given', async () => {
    const { svc, enqueuePost } = makeOrchestrator();
    await svc.publish({
      accountId: 'acc-1',
      text: 'planned',
      scheduledAt: '2030-01-01T00:00:00Z',
    });
    const call = enqueuePost.mock.calls[0][0];
    expect(call.scheduledAt.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('records the published text in content memory after a successful enqueue', async () => {
    const { svc, add } = makeOrchestrator();
    await svc.publish({ accountId: 'acc-1', text: 'remember me' });
    expect(add).toHaveBeenCalledWith('ai-copilot', 'remember me', 'acc-1');
  });

  it('returns the enqueue result merged with queued:true', async () => {
    const { svc } = makeOrchestrator({
      enqueueResult: { id: 'a-42', idempotencyKey: 'k-42' } as EnqueueResult,
    });
    const result = await svc.publish({ accountId: 'acc-1', text: 'go' });
    expect(result).toEqual({ queued: true, id: 'a-42', idempotencyKey: 'k-42' });
  });
});
