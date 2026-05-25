/**
 * Public iOS-app bearer used by the unauthenticated X API. The cookie is
 * what authenticates the session; this bearer is just the transport
 * courtesy header X expects on the v1.1 endpoints. Pinning it here means
 * a rotation (rare) is a one-file change instead of three places drifting
 * apart silently.
 *
 * Consumers: CookieHealthCheckService, login-session-check, the
 * standalone-x-login-cookies CLI.
 */
export const X_PUBLIC_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
