# Changelog

All notable changes to this project. Dates are ISO (YYYY-MM-DD).

## [Unreleased]

### Breaking

- **MCP `update_settings` now allowlists keys against `SettingsService.getDefs()`** (#61, closes #21). Unknown keys (e.g. `secrets.admin_token`) are rejected with `BadRequestException` instead of being silently upserted; value types must also match the registry declaration. Account-scoped writes are now atomic — a single invalid key rejects the entire batch. To expose a new account setting, add it to `SettingsService.DEFS`.
- Monitor read responses no longer include `webhookSecret` from
  `list_monitors`, `get_monitor`, or the REST equivalents. They now expose
  `hasWebhookSecret: boolean`; clients that need a new secret value should call
  `rotate_secret`, which returns the rotated secret once. Existing monitor
  secrets are unchanged, and clients with cached secrets keep working until the
  next rotation.

### Fixed

- **Login worker now reclaims orphaned `running` jobs and heartbeats the lock while a login is in flight** (closes #11). `claimNext` was only picking up `status='queued'` rows, so a worker crash (kill -9, container OOM) left the user's connect_x_account job stuck in `running` forever with no recovery path other than DB surgery. The SQL now also reclaims `status='running'` rows whose `locked_until` has elapsed. The worker also runs `resetStaleRunningJobs()` on bootstrap as faster recovery, and `process()` now fires a `setInterval` heartbeat (TTL/3) that calls `extendLock()` so a real long-running login can't be stolen mid-flight by another instance.
- **Login worker no longer bypasses the API cooldown ladder during in-process retries** (closes #12). `LoginWorker.process()` now calls `findActiveCooldown` before both the transient retry and the proxy fallback retry, so a freshly-tripped cooldown halts the dogpile instead of burning three attempts in 30 s. `shouldRetryWithFallbackProxy` returns `false` for `reason === 'login_cooldown'` (rotating egress doesn't lift an account-level limit, it just signals harder to X anti-abuse). `countConsecutiveFailures` now uses cumulative semantics within the recent window (widened from 3 to 5 rows), so `2 fail + 1 success + 2 fail` still trips the level-3 (24h, manual review) cooldown.
- **`recordSessionFailure` increment is now atomic; all writes share one transaction** (closes #13). The JS-side read-modify-write pattern is gone — two concurrent failure paths used to both read `prior=2` and both write `3`, silently losing the third failure (the one that should trip `AUTH_FAILURE_PAUSE_THRESHOLD`). The counter is now bumped inside a single `INSERT … ON CONFLICT DO UPDATE … RETURNING value` SQL, and the metadata writes + paused-status flip live inside the same DB transaction so a kill mid-call cannot leave the account half-marked-unhealthy. `ControlStateRepository.upsert` is also transactional now so a partial batch can no longer ship. New `ControlStateRepository.incrementCounter(accountId, key)` helper is the only path for counters going forward — never reintroduce the read-modify-write loop.

### Security

- **X session cookies (`auth_token`, `ct0`, `auth_multi`, `twid`) are now encrypted at rest** (closes #1). All writes through `AccountEntity` flow through a TypeORM transformer that wraps the value in the existing `CredentialCipherService` envelope (AES-256-GCM with HKDF-derived key, `v1:` version prefix). Legacy plaintext rows are still readable (backward-compat) so live deployments can roll out without downtime, then run `tsx src/scripts/encrypt-account-cookies.ts` with `COOKIE_ENCRYPT_MIGRATE=true` to re-encrypt existing rows. Requires `ENCRYPTION_KEY` to be set (already required for TOTP secrets and login-job passwords).
- **Magic-link `consume()` is now an atomic CAS** (closes #2). Replaced the read-then-write flow with a single `UPDATE magic_links SET consumed_at = now() WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING user_id`. Two concurrent `POST /auth/consume` calls with the same token now have exactly one winner; the loser gets `null`. Added a partial unique index (`magic_links_unconsumed_token_uniq` on `token_hash WHERE consumed_at IS NULL`) as defense-in-depth so any future regression becomes a DB-level constraint error.
- **Express `trust proxy` is now configured at boot, and the IP-based throttler stops parsing `X-Forwarded-For` manually** (closes #3). `main.ts` calls `app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback')` so `req.ip` reflects the real client behind a reverse proxy, and `TieredThrottlerGuard.getTracker` now uses `req.ip` directly. Closes the magic-link / OAuth-DCR rate-limit bypass where any unauthenticated caller could spoof `X-Forwarded-For: 1.1.1.<random>` for unlimited fresh trackers. New `TRUST_PROXY` env var documented for nginx / Cloudflare / AWS ALB / Vercel / Fly layouts.
- **Webhook URLs are now SSRF-validated at create AND delivery time** (closes #4). New `WebhookUrlValidator` rejects URLs that resolve (or are written as obfuscated IP literals — octal, hex, decimal-int, IPv4-mapped IPv6) to RFC1918, loopback, link-local (incl. `169.254.169.254` AWS metadata), IPv6 ULA, multicast, or unspecified ranges. In production, `https://` is required unless `ALLOW_HTTP_WEBHOOK=true`. Optional `WEBHOOK_HOST_ALLOWLIST` / `WEBHOOK_HOST_BLOCKLIST` env vars let operators carve exceptions for known tenant gateways. Delivery-time re-check defends against DNS rebinding between create and fire.
- **Magic-link console fallback disabled outside development** (#60, closes #5). When SMTP delivery is unconfigured or fails, the service now throws `ServiceUnavailableException` (503) instead of logging the sign-in URL to stdout. Console fallback remains in `development`, `test`, `local`, and unset `NODE_ENV` for local debugging.

### Added

- **i18n key parity test** (#62, closes #31). Vitest spec walks `frontend/messages/{en,tr}.json` recursively and fails CI on missing keys in either locale.

## 2026-05-03 — Consistency & Quality Sprint

### Breaking

- **MCP tool rename:** `retweet` → `retweet_tweet`, `unretweet` →
  `unretweet_tweet`. Existing MCP clients calling the old names receive
  `Error: Unknown tool`. Underlying action types (`retweet`,
  `unretweet`) and DB tables are unchanged — only the MCP-facing names
  shifted to the consistent `<verb>_<noun>` grammar used by every other
  write tool.

### Changed

- All write tools now flow through the action engine queue. The eight
  previously synchronous tools (`unlike_tweet`, `unretweet_tweet`,
  `unfollow_account`, `delete_tweet`, `send_dm`, `update_profile`,
  `update_avatar`, `update_banner`) now return `{ id, idempotencyKey }`
  immediately and execute asynchronously, matching the response shape of
  the other write tools. Retry, idempotency, and observability semantics
  are now uniform across the entire write surface.
- `mcp.service.ts` (1,211 lines) split into
  `mcp/handlers/{write,profile,read,monitor,account}.handler.ts` plus a
  shared `tool-definitions.ts` and `mcp-tool.context.ts`. The class is
  now ~220 lines of routing.

### Fixed

- TypeORM data source loads `.env` from repo root via
  `path.resolve(__dirname, '../../../.env')` instead of relying on cwd,
  so migrations no longer silently fall back to default credentials when
  run from `backend/`.
- `extractTweets` and `getUser` strip control characters and normalize
  `\r\n` in `textContent` before serializing, preventing `JSON.parse`
  failures on multi-line tweet responses.

### Added

- 8 new action tables and queue executors: `unlike_actions`,
  `unretweet_actions`, `unfollow_actions`, `delete_tweet_actions`,
  `dm_actions`, `profile_update_actions`, `avatar_update_actions`,
  `banner_update_actions`.
- Migration `1762500000000-DirectActionTables` creates the tables and
  rebuilds `actions_all` to include the new types.
- 15 unit tests for previously-untested read methods (`getUserFollowing`,
  `getTweetQuotes`, `getTweetReplies`, `getTweetRetweeters`,
  `getUserMentions`, `updateAvatar`, `updateBanner`).
- 41 unit tests for the new wrapper executors.
- 71 unit tests for the new MCP handlers.

### Internal

- Selector centralization: every X DOM selector used by `XDirectService`
  now lives in `SelectorRegistry` (no inline `data-testid` literals).
- Log/error messages standardized to English across the X-automation
  surface.

### Operations

- Run `cd backend && npm run db:migrate` before deploying. The migration
  is additive (new tables + view rebuild) and reversible via
  `npm run db:migrate:revert`.
- After deploy, MCP clients calling `retweet` or `unretweet` will fail
  loudly. Update client tool calls to the new names.

[Unreleased]: https://github.com/beydemirfurkan/tweetly/compare/main...HEAD
