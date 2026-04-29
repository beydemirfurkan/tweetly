const AUTH_REQUIRED_PREFIX = 'AUTH_REQUIRED:';

export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(`${AUTH_REQUIRED_PREFIX} ${message}`);
    this.name = 'AuthRequiredError';
  }
}

export function isAuthRequiredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.startsWith(AUTH_REQUIRED_PREFIX);
}
