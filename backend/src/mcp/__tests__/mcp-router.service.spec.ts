import { McpRouter } from '../mcp-router.service';
import type { McpToolContext } from '../handlers/mcp-tool.context';

function emptyCtx(): McpToolContext {
  return {
    userId: 'u',
    resolveAccountId: async () => 'a',
    resolveAccountIdOptional: async () => 'a',
    userAccountIdSet: async () => new Set(['a']),
    assertAccountOwnership: async () => undefined,
    assertActionOwnership: async () => undefined,
    assertLoginCooldownIsClear: async () => undefined,
  };
}

describe('McpRouter', () => {
  it('dispatches to a registered tool with args and ctx', async () => {
    const r = new McpRouter();
    const invoker = jest.fn(async (args: never, ctx: McpToolContext) => ({ args, user: ctx.userId }));
    r.register('post_tweet', invoker as never);

    const result = await r.dispatch('post_tweet', { foo: 1 }, emptyCtx());

    expect(invoker).toHaveBeenCalledWith({ foo: 1 }, expect.objectContaining({ userId: 'u' }));
    expect(result).toEqual({ args: { foo: 1 }, user: 'u' });
  });

  it('throws Unknown tool for an unregistered name', async () => {
    const r = new McpRouter();
    await expect(r.dispatch('does_not_exist', {}, emptyCtx())).rejects.toThrow(/Unknown tool: does_not_exist/);
  });

  it('throws on duplicate registration to prevent silent overwrites', () => {
    const r = new McpRouter();
    r.register('post_tweet', (async () => undefined) as never);
    expect(() => r.register('post_tweet', (async () => undefined) as never)).toThrow(/already registered/);
  });

  it('registeredNames lists everything that was registered', () => {
    const r = new McpRouter();
    r.register('post_tweet', (async () => undefined) as never);
    r.register('like_tweet', (async () => undefined) as never);
    expect(new Set(r.registeredNames())).toEqual(new Set(['post_tweet', 'like_tweet']));
  });
});
