import { SetMetadata } from '@nestjs/common';

export type ApiScope = 'read' | 'write' | '*';

export const REQUIRES_SCOPE_KEY = 'tweetly:requires-scope';

/**
 * Mark a route with the API-key scope it requires.
 *
 * Scope semantics:
 *   - `*`     full access (default for web-session keys created by /auth/consume)
 *   - `read`  GET / list operations only
 *   - `write` mutating operations (POST / PUT / PATCH / DELETE on /api/v1/*)
 *
 * A key with `*` passes any RequiresScope check. A key with `write` also
 * implies `read`. Routes that should never be reachable by a scoped key
 * (e.g. /auth/api-keys management) require `*` explicitly.
 */
export const RequiresScope = (scope: ApiScope) => SetMetadata(REQUIRES_SCOPE_KEY, scope);
