import { Injectable } from '@nestjs/common';
import type { McpToolArgs, McpToolContext } from './handlers/mcp-tool.context';
import type { ToolName } from './handlers/tool-schemas';

export type McpToolInvoker = (args: never, ctx: McpToolContext) => Promise<unknown>;

/**
 * Tool-name → handler-method routing table. Each MCP tool handler registers
 * the (typed) methods it owns at bootstrap; McpService.dispatch then just
 * looks the name up here instead of carrying a giant switch/case. Adding a
 * new tool only touches the handler that owns it — schema, definition and
 * registration live in the same place.
 */
@Injectable()
export class McpRouter {
  private readonly routes = new Map<string, McpToolInvoker>();

  register(name: ToolName, invoker: McpToolInvoker): void {
    if (this.routes.has(name)) {
      throw new Error(`MCP tool already registered: ${name}`);
    }
    this.routes.set(name, invoker);
  }

  has(name: string): boolean {
    return this.routes.has(name);
  }

  registeredNames(): readonly string[] {
    return [...this.routes.keys()];
  }

  async dispatch(name: string, args: McpToolArgs, ctx: McpToolContext): Promise<unknown> {
    const invoker = this.routes.get(name);
    if (!invoker) throw new Error(`Unknown tool: ${name}`);
    return invoker(args as never, ctx);
  }
}
