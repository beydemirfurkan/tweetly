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

### Security

- **X session cookies (`auth_token`, `ct0`, `auth_multi`, `twid`) are now encrypted at rest** (closes #1). All writes through `AccountEntity` flow through a TypeORM transformer that wraps the value in the existing `CredentialCipherService` envelope (AES-256-GCM with HKDF-derived key, `v1:` version prefix). Legacy plaintext rows are still readable (backward-compat) so live deployments can roll out without downtime, then run `tsx src/scripts/encrypt-account-cookies.ts` with `COOKIE_ENCRYPT_MIGRATE=true` to re-encrypt existing rows. Requires `ENCRYPTION_KEY` to be set (already required for TOTP secrets and login-job passwords).
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
