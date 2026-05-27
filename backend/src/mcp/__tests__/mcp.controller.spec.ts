import type { Request, Response } from 'express';

import { McpController } from './mcp.controller';
import type { McpService } from './mcp.service';

describe('McpController.messages', () => {
  it('passes the Nest-parsed body to the SSE transport', async () => {
    const parsedBody = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    const req = {
      tweetlyAuth: { userId: 'user-1', apiKeyId: 'key-1', scopes: ['*'] },
      body: parsedBody,
    } as unknown as Request;
    const res = {} as Response;
    const transport = { handlePostMessage: jest.fn().mockResolvedValue(undefined) };
    const service = {
      getTransport: jest.fn().mockReturnValue(transport),
      getSessionUserId: jest.fn().mockReturnValue('user-1'),
      lookupSessionHost: jest.fn(),
      instanceId: 'test-instance',
    } as unknown as jest.Mocked<McpService>;
    const controller = new McpController(service);

    await controller.messages('session-1', req, res);

    expect(transport.handlePostMessage).toHaveBeenCalledWith(req, res, parsedBody);
  });
});
