import { TOOL_DEFINITIONS } from './tool-definitions';
import { TOOL_SCHEMAS } from './tool-schemas';

/**
 * Drift guard between the JSON Schemas exposed to MCP clients
 * (TOOL_DEFINITIONS) and the runtime Zod parsers used by the dispatcher
 * (TOOL_SCHEMAS). Adding a tool to one without the other is the most
 * common slip — this spec catches it before merge.
 */
describe('tool-schema drift', () => {
  it('every TOOL_DEFINITION has a matching Zod schema', () => {
    const missing: string[] = [];
    for (const def of TOOL_DEFINITIONS) {
      if (!(def.name in TOOL_SCHEMAS)) missing.push(def.name);
    }
    expect(missing).toEqual([]);
  });

  it('every Zod schema has a matching TOOL_DEFINITION (no orphan schemas)', () => {
    const defNames = new Set<string>(TOOL_DEFINITIONS.map((d) => d.name));
    const orphans = Object.keys(TOOL_SCHEMAS).filter((name) => !defNames.has(name));
    expect(orphans).toEqual([]);
  });

  it('count matches: definitions ↔ schemas', () => {
    expect(Object.keys(TOOL_SCHEMAS).length).toBe(TOOL_DEFINITIONS.length);
  });
});
