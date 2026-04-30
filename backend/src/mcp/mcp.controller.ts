import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { AdminTokenGuard } from '../admin-api/admin-token.guard';
import { McpService } from './mcp.service';

@Controller('mcp')
@UseGuards(AdminTokenGuard)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('sse')
  async sse(@Req() req: Request, @Res() res: Response): Promise<void> {
    const transport = new SSEServerTransport('/mcp/messages', res);
    const server = this.mcpService.createServer();

    this.mcpService.setTransport(transport.sessionId, transport);
    req.on('close', () => this.mcpService.deleteTransport(transport.sessionId));

    await server.connect(transport);
  }

  @Post('messages')
  async messages(
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const transport = this.mcpService.getTransport(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    await transport.handlePostMessage(req, res);
  }
}
