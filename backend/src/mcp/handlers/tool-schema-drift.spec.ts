import { z } from 'zod';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { TOOL_SCHEMAS } from './tool-schemas';

/**
 * Drift guard between the JSON Schemas exposed to MCP clients
 * (TOOL_DEFINITIONS) and the runtime Zod parsers used by the dispatcher
 * (TOOL_SCHEMAS).
 *
 * Three classes of drift get caught here, in order of detection cost:
 *   1. Tool name mismatch (orphan in either side).
 *   2. Required-field mismatch (the JSON Schema and the Zod schema disagree
 *      about which inputs the dispatcher will reject as missing).
 *   3. Unknown property in JSON Schema (a property documented to MCP that the
 *      Zod parser doesn't enforce — silent acceptance of garbage).
 *
 * Adding a tool, renaming an arg, or making a previously required field
 * optional in only one place must show up here.
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

  it('per-tool: required field set matches between JSON Schema and Zod', () => {
    const drifts: Array<{ tool: string; jsonOnly: string[]; zodOnly: string[] }> = [];
    for (const def of TOOL_DEFINITIONS) {
      const schema = TOOL_SCHEMAS[def.name as keyof typeof TOOL_SCHEMAS];
      if (!(schema instanceof z.ZodObject)) continue;
      const zodRequired = new Set(zodRequiredKeys(schema));
      const jsonRequired = new Set(jsonRequiredKeys(def));
      const jsonOnly = [...jsonRequired].filter((k) => !zodRequired.has(k));
      const zodOnly = [...zodRequired].filter((k) => !jsonRequired.has(k));
      if (jsonOnly.length || zodOnly.length) drifts.push({ tool: def.name, jsonOnly, zodOnly });
    }
    expect(drifts).toEqual([]);
  });

  it('per-tool: every JSON Schema property exists in the Zod shape', () => {
    const unknown: Array<{ tool: string; props: string[] }> = [];
    for (const def of TOOL_DEFINITIONS) {
      const schema = TOOL_SCHEMAS[def.name as keyof typeof TOOL_SCHEMAS];
      if (!(schema instanceof z.ZodObject)) continue;
      const zodKeys = new Set(Object.keys(schema.shape));
      const jsonProps = jsonPropertyNames(def);
      const extra = jsonProps.filter((k) => !zodKeys.has(k));
      if (extra.length) unknown.push({ tool: def.name, props: extra });
    }
    expect(unknown).toEqual([]);
  });
});

function zodRequiredKeys(schema: z.ZodObject<z.ZodRawShape>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(schema.shape)) {
    if (typeof (value as z.ZodTypeAny).isOptional === 'function' && !(value as z.ZodTypeAny).isOptional()) {
      out.push(key);
    }
  }
  return out;
}

function jsonRequiredKeys(def: (typeof TOOL_DEFINITIONS)[number]): string[] {
  const schema = (def as { inputSchema?: { required?: string[] } }).inputSchema;
  return Array.isArray(schema?.required) ? schema!.required : [];
}

function jsonPropertyNames(def: (typeof TOOL_DEFINITIONS)[number]): string[] {
  const schema = (def as { inputSchema?: { properties?: Record<string, unknown> } }).inputSchema;
  return schema?.properties ? Object.keys(schema.properties) : [];
}
