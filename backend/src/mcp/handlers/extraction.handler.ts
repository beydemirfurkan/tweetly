import { Injectable } from '@nestjs/common';
import { ExtractionService } from '@/extractions/extraction.service';
import type {
  ExtractionParams,
  ExtractionType,
} from '@persistence/entities/extraction-job.entity';
import { BaseMcpHandler } from './base.handler';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Bulk extraction MCP tools. Wraps ExtractionService — kicks off async
 * jobs that pollute none of the caller's API key budget per row, then
 * lets clients poll via get_extraction. The actual file is downloaded
 * over REST since MCP isn't a streaming-binary transport.
 */
@Injectable()
export class ExtractionHandler extends BaseMcpHandler {
  constructor(private readonly extractions: ExtractionService) {
    super();
  }

  async createExtraction(args: McpToolArgs, ctx: McpToolContext) {
    const type = args.type as ExtractionType;
    const rawParams = (args.params ?? {}) as Record<string, unknown>;
    // tool-schemas uses snake_case for nested keys (tweet_url, list_id,
    // verified_only); the entity uses camelCase. Translate here.
    const params: ExtractionParams = {
      handle: rawParams.handle as string | undefined,
      tweetUrl: rawParams.tweet_url as string | undefined,
      listId: rawParams.list_id as string | undefined,
      query: rawParams.query as string | undefined,
      verifiedOnly: rawParams.verified_only as boolean | undefined,
    };
    const maxRows = (args.max_rows as number | undefined) ?? 1000;
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.extractions.validateAndEnqueue({
      userId: ctx.userId,
      accountId: accountId ?? null,
      type,
      params,
      maxRows,
    });
  }

  async getExtraction(args: McpToolArgs, ctx: McpToolContext) {
    const jobId = args.job_id as string;
    if (!jobId) throw new Error('job_id is required');
    return this.extractions.findForUser(jobId, ctx.userId);
  }

  async listExtractions(args: McpToolArgs, ctx: McpToolContext) {
    const limit = Math.min(Number(args.limit ?? 20), 100);
    return this.extractions.listForUser(ctx.userId, limit);
  }

  async cancelExtraction(args: McpToolArgs, ctx: McpToolContext) {
    const jobId = args.job_id as string;
    if (!jobId) throw new Error('job_id is required');
    const ok = await this.extractions.cancel(jobId, ctx.userId);
    return { ok };
  }
}
