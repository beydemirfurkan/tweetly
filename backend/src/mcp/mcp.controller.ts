import {
  All,
  BadGatewayException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiKeyGuard, getAuthContext } from '@/auth/api-key.guard';
import { OAuthChallenge } from '@/oauth/oauth-challenge.decorator';
import { McpService } from './mcp.service';

@Controller('mcp')
@UseGuards(ApiKeyGuard)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  // Streamable HTTP transport (MCP 2025-06-18). Stateless: each request
  // gets a fresh transport + server, no session state. Handles GET, POST,
  // and DELETE per the spec — the SDK does method routing internally.
  @All()
  @OAuthChallenge()
  async streamable(@Req() req: Request, @Res() res: Response): Promise<void> {
    const ctx = getAuthContext(req);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = this.mcpService.createServer(ctx.userId);

    res.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get('sse')
  async sse(@Req() req: Request, @Res() res: Response): Promise<void> {
    const ctx = getAuthContext(req);
    const transport = new SSEServerTransport('/mcp/messages', res);
    const server = this.mcpService.createServer(ctx.userId);

    this.mcpService.setTransport(transport.sessionId, transport, ctx.userId);
    req.on('close', () => this.mcpService.deleteTransport(transport.sessionId));

    await server.connect(transport);
  }

  @Post('messages')
  async messages(
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ctx = getAuthContext(req);
    const transport = this.mcpService.getTransport(sessionId);

    if (!transport) {
      // Local instance doesn't host this SSE session. Check the cluster
      // registry — if another instance owns it the load balancer is not
      // sticky-routing correctly; surface that as a 502 so the caller
      // (and operator logs) sees a clear actionable signal instead of
      // a stale 404.
      const host = await this.mcpService.lookupSessionHost(sessionId);
      if (host && host !== this.mcpService.instanceId) {
        throw new BadGatewayException({
          error: 'session_on_other_instance',
          message:
            `MCP session is hosted by instance ${host} but this request landed ` +
            `on ${this.mcpService.instanceId}. Configure sticky sessions (cookie ` +
            `or hash on Authorization header) on your load balancer.`,
          sessionHost: host,
          currentInstance: this.mcpService.instanceId,
        });
      }
      throw new NotFoundException('Session not found or expired');
    }

    const sessionUserId = this.mcpService.getSessionUserId(sessionId);
    if (sessionUserId !== ctx.userId) {
      throw new UnauthorizedException('Session does not belong to caller');
    }
    await transport.handlePostMessage(req, res, req.body);
  }
}
