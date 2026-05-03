// Public-facing URLs for OAuth metadata. These must be stable and match
// what clients (Claude Desktop, ChatGPT Connectors, etc.) cache; do not
// derive from request host headers.

export function backendBaseUrl(): string {
  return (process.env.PUBLIC_BACKEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

export function appBaseUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export const MCP_RESOURCE_PATH = '/mcp';
