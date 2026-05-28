import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ActionEnqueueService, type EnqueueResult } from '@/action-engine/action-enqueue.service';
import { ContentMemoryService } from '@/content-memory/content-memory.service';

export interface PublishOrchestratorInput {
  accountId: string;
  text: string;
  scheduledAt?: string | Date | null;
}

export interface PublishOrchestratorResult extends EnqueueResult {
  queued: true;
}

/**
 * Owns the "publish a tweet drafted by AI Copilot" workflow:
 *   1. dedup against content memory,
 *   2. enqueue the post,
 *   3. record the text in content memory so future drafts can detect echoes.
 *
 * The controller used to inline all three steps. Lifting them here means the
 * controller stays HTTP-only, the agent pipeline can call the same workflow,
 * and the dedup → enqueue → record sequence is testable as one unit.
 */
@Injectable()
export class PublishOrchestratorService {
  private readonly logger = new Logger(PublishOrchestratorService.name);

  static readonly MEMORY_SOURCE = 'ai-copilot';

  constructor(
    private readonly enqueue: ActionEnqueueService,
    private readonly contentMemory: ContentMemoryService,
  ) {}

  async publish(input: PublishOrchestratorInput): Promise<PublishOrchestratorResult> {
    const dedupReason = await this.contentMemory.similarityReason(input.text, input.accountId);
    if (dedupReason) {
      throw new BadRequestException(`Similar content already posted: ${dedupReason}`);
    }

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    const result = await this.enqueue.enqueuePost({
      accountId: input.accountId,
      text: input.text,
      scheduledAt,
      metadata: { source: PublishOrchestratorService.MEMORY_SOURCE },
    });

    await this.contentMemory.add(PublishOrchestratorService.MEMORY_SOURCE, input.text, input.accountId);
    this.logger.log(`published account=${input.accountId} action=${result.id ?? 'idempotent-hit'}`);

    return { queued: true, ...result };
  }
}
