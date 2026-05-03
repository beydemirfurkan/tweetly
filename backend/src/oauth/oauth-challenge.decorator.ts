import { SetMetadata } from '@nestjs/common';

export const OAUTH_CHALLENGE_KEY = 'oauth_challenge';

// Marks a route as OAuth-protected per MCP 2025-06-18. ApiKeyGuard reads
// this and adds a WWW-Authenticate header on 401 so MCP clients can
// discover the protected resource metadata URL.
export const OAuthChallenge = () => SetMetadata(OAUTH_CHALLENGE_KEY, true);
