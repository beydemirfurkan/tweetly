import { McpController } from './mcp.controller';

const mockTransport = {
  sessionId: 'test-session-id',
  handlePostMessage: jest.fn().mockResolvedValue(null),
};

jest.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: jest.fn().mockImplementation(() => mockTransport),
}));

function createController() {
  const server = { connect: jest.fn().mockResolvedValue(null) };
  const mcpService = {
    createServer: jest.fn().mockReturnValue(server),
    getTransport: jest.fn(),
    setTransport: jest.fn(),
    deleteTransport: jest.fn(),
  };
  const controller = new McpController(mcpService as any);
  return { controller, mcpService, server };
}

function mockReq(overrides: Partial<{ on: jest.Mock }> = {}) {
  return { on: jest.fn(), ...overrides } as any;
}

function mockRes() {
  const res = { status: jest.fn(), json: jest.fn(), write: jest.fn(), end: jest.fn() } as any;
  res.status.mockReturnValue(res);
  return res;
}

describe('McpController', () => {
  afterEach(() => jest.clearAllMocks());

  describe('sse()', () => {
    it('creates transport, registers it, and connects server', async () => {
      const { controller, mcpService, server } = createController();
      const req = mockReq();
      const res = mockRes();

      await controller.sse(req, res);

      expect(mcpService.createServer).toHaveBeenCalled();
      expect(mcpService.setTransport).toHaveBeenCalledWith('test-session-id', mockTransport);
      expect(server.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('registers close handler that removes transport', async () => {
      const { controller, mcpService } = createController();
      const req = mockReq();

      await controller.sse(req, mockRes());

      const [event, handler] = req.on.mock.calls[0];
      expect(event).toBe('close');
      handler();
      expect(mcpService.deleteTransport).toHaveBeenCalledWith('test-session-id');
    });
  });

  describe('messages()', () => {
    it('calls handlePostMessage when session exists', async () => {
      const { controller, mcpService } = createController();
      mcpService.getTransport.mockReturnValue(mockTransport);
      const req = mockReq();
      const res = mockRes();

      await controller.messages('test-session-id', req, res);

      expect(mockTransport.handlePostMessage).toHaveBeenCalledWith(req, res);
    });

    it('returns 404 when session does not exist', async () => {
      const { controller, mcpService } = createController();
      mcpService.getTransport.mockReturnValue(undefined);
      const res = mockRes();

      await controller.messages('unknown-session', mockReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Session not found or expired' });
    });
  });
});
