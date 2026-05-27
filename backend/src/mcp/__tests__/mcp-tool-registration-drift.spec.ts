import { TOOL_SCHEMAS } from '../handlers/tool-schemas';
import { TOOL_DEFINITIONS } from '../handlers/tool-definitions';
import { McpRouter } from '../mcp-router.service';
import { McpToolBindings } from '../mcp-tool-bindings';
import { WriteHandler } from '../handlers/write.handler';
import { ProfileHandler } from '../handlers/profile.handler';
import { ReadHandler } from '../handlers/read.handler';
import { MonitorHandler } from '../handlers/monitor.handler';
import { AccountHandler } from '../handlers/account.handler';
import { ExtractionHandler } from '../handlers/extraction.handler';

// Stub each handler with no real deps. The bindings file only references
// method handles as `(args, ctx) => handler.method(args, ctx)` — invoking
// them isn't part of this drift guard, just enumerating their wiring.
function stubHandlers() {
  const handlerProxy = (): unknown =>
    new Proxy({}, { get: () => () => Promise.resolve(undefined) });
  return {
    write: handlerProxy() as WriteHandler,
    profile: handlerProxy() as ProfileHandler,
    read: handlerProxy() as ReadHandler,
    monitor: handlerProxy() as MonitorHandler,
    account: handlerProxy() as AccountHandler,
    extraction: handlerProxy() as ExtractionHandler,
  };
}

describe('MCP tool registration drift', () => {
  it('every TOOL_SCHEMAS key is bound on bootstrap', () => {
    const router = new McpRouter();
    const handlers = stubHandlers();
    const bindings = new McpToolBindings(
      router,
      handlers.write,
      handlers.profile,
      handlers.read,
      handlers.monitor,
      handlers.account,
      handlers.extraction,
    );
    bindings.onApplicationBootstrap();

    const registered = new Set(router.registeredNames());
    const expected = Object.keys(TOOL_SCHEMAS);
    for (const tool of expected) {
      expect(registered.has(tool)).toBe(true);
    }
    expect(registered.size).toBe(expected.length);
  });

  it('every TOOL_DEFINITIONS entry exists in TOOL_SCHEMAS', () => {
    const definitionNames = new Set(TOOL_DEFINITIONS.map((d) => d.name));
    const schemaNames = new Set(Object.keys(TOOL_SCHEMAS));
    for (const name of definitionNames) {
      expect(schemaNames.has(name)).toBe(true);
    }
  });
});
