import { Controller, Get, NotFoundException, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ApiKeyGuard, getAuthContext } from '../auth/api-key.guard';
import { McpService } from './mcp.service';

@Controller('mcp')
@UseGuards(ApiKeyGuard)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

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
      throw new NotFoundException('Session not found or expired');
    }
    const sessionUserId = this.mcpService.getSessionUserId(sessionId);
    if (sessionUserId !== ctx.userId) {
      throw new UnauthorizedException('Session does not belong to caller');
    }
    await transport.handlePostMessage(req, res);
  }
}
