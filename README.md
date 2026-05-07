# tweetly

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build](https://img.shields.io/badge/build-NestJS%2011%20%7C%20Next.js%2016-blue)](#architecture)

> **Live demo:** [tw-panel.beydemir.dev](https://tw-panel.beydemir.dev) — request a magic link with your email, mint a `tk_*` API key for your own AI agent.
> For production, **self-host on your own infrastructure** — see the "Coolify deploy" section below.

An MCP-based action layer for X (Twitter). Developers connect their own AI agents (Claude Code, Codex, etc.) and bring their own content; tweetly executes the post / engage / read actions on X.

Content generation, persona, voice, and prompts are **not** stored on the backend — tweetly is a pure "act on X" layer.

## Disclaimer

Tweetly does **not** use X's official public API. It drives X through a **real browser session** (Patchright + persisted cookies). Two consequences follow:

1. **It may violate X's Terms of Service.** Automation, third-party session sharing, and synthetic engagement all sit in ToS gray/red territory. Account suspension risk is on you.
2. **This is not a vetted enterprise product.** The repository is a research / personal-use project. Run a risk assessment before pointing it at customer accounts in production.

All liability remains with the user under the MIT License — see `LICENSE`.

## Architecture

**Stack:** NestJS 11, TypeScript, PostgreSQL + TypeORM, Patchright (anti-detection browser), MCP SDK.

```
backend/src/
  accounts/          Account management (per-user X session tokens)
  action-engine/     ClaimWorker, ExecutorRegistry, CircuitBreaker, RetryPolicy
                     GenericActionRepository (FOR UPDATE SKIP LOCKED)
  admin-api/         AdminApiController, AdminTokenGuard, AdminApiService
  ai-copilot/        Optional content analysis (env-gated to specific emails)
  auth/              UsersService, ApiKeyService, MagicLinkService, ApiKeyGuard
  content-memory/    Jaccard similarity dedup (optional)
  domain/            Port interfaces, domain services, action types
  mcp/               MCP server (SSE transport, ~43 tools)
  monitoring/        Account monitor + webhook delivery
  oauth/             OAuth2 authorization server for MCP clients
  observability/     HealthController, MetricsController (Prometheus)
  persistence/       TypeORM DataSource, entities, migrations
  public-api/        REST controllers under /api/v1, user-scoped
  settings/          Per-account override-aware settings service
  x-automation/      XBrowserService, XPostFlowService, SelectorRegistry
                     NoOp + Patchright executors per action type
  app.module.ts
  main.ts

frontend/src/
  app/[locale]/      Next.js 16 panel (i18n: tr/en)
  components/        Shadcn-based UI
  i18n/              next-intl config
  lib/               API client, auth context, hooks
```

### Action engine

Each action type (`post`, `reply`, `like`, `bookmark`, `retweet`, `quote`, `follow`, `unlike`, `unretweet`, `unfollow`, `delete_tweet`, `dm`, `profile_update`, `avatar_update`, `banner_update`) lives in its own Postgres table. The `ClaimWorker` polls with `FOR UPDATE SKIP LOCKED` and the `ExecutorRegistry` dispatches to the matching executor.

```
pending → claimed → running → succeeded
                           ↘ failed → pending (retry)
                                    ↘ dead
         ↘ cancelled (admin)
```

### MCP tool surface (summary)

- **Write:** `post_tweet`, `reply_to_tweet`, `like_tweet`, `retweet_tweet`, `quote_tweet`, `bookmark_tweet`, `follow_account`, `post_thread`
- **Undo / delete:** `unlike_tweet`, `unretweet_tweet`, `unfollow_account`, `delete_tweet`, `send_dm`, `update_profile`, `update_avatar`, `update_banner`
- **Read:** `search_tweets`, `get_user`, `get_tweet`, `get_user_tweets`, `search_users`, `get_user_followers`, `get_user_following`, `get_tweet_retweeters`, `get_tweet_quotes`, `get_tweet_replies`, `get_user_mentions`, `get_x_trending`, `get_user_likes`, `get_my_bookmarks`, `get_thread`, `get_mutual_followers`, `get_user_lists`, `get_list`, `get_list_members`, `get_list_subscribers`
- **Management:** `get_accounts`, `get_account_health`, `connect_x_account`, `reauth_x_account`, `get_x_login_job`, `list_actions`, `cancel_action`, `replay_action`, `get_settings`, `update_settings`
- **Monitor:** `create_monitor`, `list_monitors`, `get_monitor`, `delete_monitor`, `pause_monitor`
- **Bulk extractions:** `create_extraction`, `get_extraction`, `list_extractions`, `cancel_extraction`

> **Breaking (2026-05-03):** `retweet` → `retweet_tweet`, `unretweet` → `unretweet_tweet`. Old names now return `Unknown tool`.

---

## Setup

```bash
git clone https://github.com/beydemirfurkan/tweetly.git
cd tweetly

npm install
npm --prefix backend install --legacy-peer-deps
npm --prefix frontend install
npx patchright install chromium

cp .env.example .env
# Generate a 32-byte master key and paste it as ENCRYPTION_KEY in .env:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

docker compose up -d postgres
npm run db:migrate
```

---

## Commands

```bash
npm run build          # tsc → dist/ for backend; next build for frontend
npm run dev:backend    # backend dev server (http://localhost:3001)
npm run dev:frontend   # frontend dev server (http://localhost:3000)
npm test               # backend unit tests + frontend tests
npm run lint           # backend + frontend lint
npm run typecheck      # backend + frontend type-check

npm run db:migrate         # apply pending migrations
npm run db:migrate:revert  # revert the last migration
```

### Local smoke tests

Run the MCP and REST tool matrix against a local backend before deploying:

```bash
cd backend
TWEETLY_API_KEY=tk_... TWEETLY_ACCOUNT_ID=your-x-handle npm run smoke:mcp
TWEETLY_API_KEY=tk_... TWEETLY_ACCOUNT_ID=your-x-handle npm run smoke:rest

# Include X read paths
TWEETLY_API_KEY=tk_... TWEETLY_ACCOUNT_ID=... TWEETLY_SMOKE_SUITE=read npm run smoke:mcp
TWEETLY_API_KEY=tk_... TWEETLY_ACCOUNT_ID=... TWEETLY_SMOKE_SUITE=read npm run smoke:rest

# Queue/write tools require explicit opt-in
TWEETLY_API_KEY=tk_... TWEETLY_ACCOUNT_ID=... TWEETLY_SMOKE_SUITE=queue \
  TWEETLY_ALLOW_WRITE_SMOKE=true \
  TWEETLY_TARGET_TWEET_URL=https://x.com/.../status/... \
  npm run smoke:mcp
```

The `destructive` suite (`delete_tweet`, `update_profile`, `send_dm`, `unfollow`, etc.) must only run against a throwaway test account and requires `TWEETLY_ALLOW_DESTRUCTIVE_SMOKE=true`.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `ENCRYPTION_KEY` | Yes | 32-byte base64 master key for AES-256-GCM credential encryption |
| `X_EXECUTOR_MODE` | Yes | `patchright` for real X delivery; `noop` for local dry-runs |
| `BOOTSTRAP_ADMIN_TOKEN` | First boot only | Temporary token used to seed `secrets.admin_token` in the DB |
| `BOOTSTRAP_ADMIN_EMAIL` | First boot only | Email of the first admin user to create |
| `CORS_ORIGINS` | Production | Comma-separated origin whitelist (empty = reject all) |
| `REDIS_URL` | Multi-instance | Required when running 2+ backend replicas |
| `AI_COPILOT_ADMIN_EMAILS` | Optional | Comma-separated emails allowed to use the AI Copilot module (empty = feature off) |

After first boot, write a permanent admin token to the DB and remove `BOOTSTRAP_ADMIN_TOKEN` from your environment:

```bash
curl -X PUT -H "Authorization: Bearer $BOOTSTRAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"adminToken":"<another-random-32-byte-hex>"}' \
  http://localhost:3001/admin/secrets
```

### SMTP credentials live in the database

Magic-link emails are sent through SMTP. **No SMTP variables are read from env** — credentials are stored in the DB via `PUT /admin/secrets`. Pick a provider (Postmark, Mailgun, SES, Gmail, etc.) and write the credentials in:

```bash
curl -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mailProvider": "smtp",
    "smtpHost": "smtp.postmarkapp.com",
    "smtpPort": 587,
    "smtpUser": "your-server-token",
    "smtpPass": "your-server-token",
    "smtpSecure": false,
    "mailFrom": "Tweetly <noreply@yourdomain.com>"
  }' \
  http://localhost:3001/admin/secrets
```

The transporter is rebuilt on the next magic-link send — no restart needed. Updating credentials at the same endpoint cycles the previous transporter automatically.

If `mailProvider` stays `console` (the default), magic links are written to backend stdout instead of being sent — ideal for local dev.

### Connect an X account

Tweetly logs into X using its own browser automation; the user never has to copy `auth_token` / `ct0` / `twid`. Kick off a server-side login job:

```bash
curl -X POST -H "Authorization: Bearer $TWEETLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"username":"foo","password":"x-password","email":"foo@example.com","totpSecret":null,"saveTotpSecret":false,"proxyCountry":"TR"}' \
  http://localhost:3001/api/v1/accounts/connect
```

The response is `202 Accepted` with a `jobId`. Poll its status:

```bash
curl -H "Authorization: Bearer $TWEETLY_API_KEY" \
  http://localhost:3001/api/v1/accounts/login-jobs/$JOB_ID
```

When a session breaks, re-authenticate the same account:

```bash
curl -X POST -H "Authorization: Bearer $TWEETLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"x-password","email":"foo@example.com","totpSecret":null,"saveTotpSecret":false,"proxyCountry":"TR"}' \
  http://localhost:3001/api/v1/accounts/foo/reauth
```

`proxyCountry` is optional. If omitted, the backend uses `LOGIN_DEFAULT_PROXY_COUNTRY`; for reauth, it falls back to the account's stored `proxy_country`. X temporarily blocks bursts of logins from the same server IP, so configuring per-region egress proxies in production is recommended:

```bash
LOGIN_DEFAULT_PROXY_COUNTRY=TR
LOGIN_FALLBACK_PROXY_COUNTRIES=US,DE
LOGIN_PROXY_TR=http://user:pass@tr.proxy.example:8080
LOGIN_PROXY_US=http://user:pass@us.proxy.example:8080
```

If the X onboarding flow returns a transient "try again later" or stalls on the username step, the worker retries once with the first configured fallback proxy country.

### When does a session break?

When an X session expires or X flags a "new device" sign-in, Patchright surfaces an auth failure. Tweetly records it automatically:

- **1+ consecutive failures** → an "Expired token?" badge appears on the Accounts list (hover for the last error reason).
- **3 consecutive failures** → the account is auto-`paused` (queued actions are held; production stalls).

From there, the **Re-authenticate** flow on the Accounts page opens a new session using the username, password, and 2FA secret if applicable.

---

## MCP connection (Claude Code example)

The MCP `/mcp/sse` endpoint is authenticated with a **user `tk_*` API key** (not the admin token). Each user connects with their own key and can only act on their own accounts.

```bash
# Mint a tk_ key from the panel: /login → magic link → API Keys page.
claude mcp add tweetly --url http://localhost:3001/mcp/sse \
  --header "Authorization: Bearer $TWEETLY_API_KEY"   # tk_xxx...
```

Then, inside Claude Code: "Post 'hello world' through tweetly" triggers the `post_tweet` tool, which enqueues to the action engine and dispatches Patchright to publish on X.

> **Auth model summary:**
> - `tk_*` user key → `/mcp/*`, `/api/v1/*` (the user's own accounts, multi-tenant)
> - `secrets.admin_token` → `/admin/*` (operator/sysadmin endpoints, all users)
>
> Don't mix them — never hand the admin token to an MCP client.

---

## Webhook HMAC verification

When you create a monitor, the response includes `webhookSecret` — shown only once. Your webhook receiver must verify the `X-Tweetly-Signature` header with this secret:

```js
// Express example
app.post('/tweetly-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.header('X-Tweetly-Signature') ?? '';
  const [tPart, vPart] = header.split(',');
  const ts = tPart?.split('=')[1];
  const sig = vPart?.split('=')[1];
  if (!ts || !sig) return res.status(400).end();

  const expected = crypto
    .createHmac('sha256', process.env.TWEETLY_WEBHOOK_SECRET)
    .update(`${ts}.${req.body.toString('utf8')}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).end();
  }
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(401).end();

  // Trusted body — process.
  const payload = JSON.parse(req.body.toString('utf8'));
  // ...
  res.status(200).end();
});
```

Lost the secret? Rotate via `POST /api/v1/monitors/:id/rotate-secret`.

---

## Admin API

```bash
# Public
curl http://localhost:3001/health
curl http://localhost:3001/ready

# Status / metrics (admin token required)
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/status
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/metrics
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/queue/depth

# Action management
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" "http://localhost:3001/admin/actions?type=post&status=dead"
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/actions/post/UUID/replay
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/actions/post/UUID/cancel

# Manual test post
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"hello","account":"foo"}' \
  http://localhost:3001/admin/test/post
```

---

## Docker / Coolify deploy

```bash
cp .env.example .env
docker compose up --build
```

| Volume | Contents |
|---|---|
| `tweetly_state` | `/data` — sessions, media, logs |
| `tweetly_pgdata` | PostgreSQL data directory |

---

## Coolify deploy

### Services

| Service | Type | Notes |
|---|---|---|
| `tweetly-backend` | Application (Dockerfile) | `backend/` directory, `Dockerfile` build, port 3000 |
| `tweetly-frontend` | Application (Dockerfile) | `frontend/` directory, build arg `NEXT_PUBLIC_API_URL=https://api.your-domain.com` |
| `tweetly-postgres` | Managed Postgres | Coolify add-on, 16-alpine, persistent volume |

### Backend env (Coolify → Environment Variables)

```env
DATABASE_URL=postgres://tweetly:tweetly@<coolify-postgres>:5432/tweetly
NODE_ENV=production
X_EXECUTOR_MODE=patchright
APP_URL=https://panel.yourdomain.com
CORS_ORIGINS=https://panel.yourdomain.com
BOOTSTRAP_ADMIN_TOKEN=<random-32-byte-hex>      # one-time
BOOTSTRAP_ADMIN_EMAIL=you@yourdomain.com         # first user's email
# REDIS_URL=redis://<coolify-redis>:6379         # required for 2+ instances
```

### Frontend env

```env
# Build arg (Coolify "Build Arguments"):
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

If you keep the `panel.*` ↔ `api.*` naming convention, `NEXT_PUBLIC_API_URL` can be omitted — `lib/api.ts` derives it at runtime. Any other convention requires the build arg.

### Persistent volume

The backend container expects a persistent volume mounted at `/data`:
- `/data/user-data` — X session profiles (cookie persistence)
- `/data/app-data/{errors,logs}` — runtime artifacts

The Patchright Chromium binary is stored at `/app/browsers` inside the image. **Don't mount `/data` over `/app/browsers`** — Coolify volume mounts shadow the in-image binary.

In Coolify: "Persistent Storage" → mount `/data`.

### Bootstrap flow (post-deploy, one-time)

```bash
# 1. Create the first admin user
curl -X POST -H "Authorization: Bearer $BOOTSTRAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@yourdomain.com"}' \
  https://api.your-domain.com/admin/users

# 2. Write the permanent admin token + SMTP credentials
curl -X PUT -H "Authorization: Bearer $BOOTSTRAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "adminToken": "<another-random-32-byte-hex>",
    "mailProvider": "smtp",
    "smtpHost": "smtp.postmarkapp.com",
    "smtpPort": 587,
    "smtpUser": "<provider-user>",
    "smtpPass": "<provider-pass>",
    "mailFrom": "Tweetly <noreply@yourdomain.com>"
  }' \
  https://api.your-domain.com/admin/secrets

# 3. Remove BOOTSTRAP_ADMIN_TOKEN from Coolify env, redeploy
# 4. Frontend → /login → enter email → click magic link from SMTP → in
```

### Migration

From Coolify "Run Command":

```bash
npm run db:migrate
```

Run once after the first deploy. Subsequent migrations don't auto-apply on container start — you have to run the command manually.

---

## Single-instance vs multi-instance

Tweetly runs in a single Node process with zero extra configuration. To scale horizontally there are four coordination points; three are handled in code, the fourth is a load-balancer setting:

| Component | Multi-instance setup |
|---|---|
| **Action ClaimWorker** | Postgres `FOR UPDATE SKIP LOCKED` already safe — no extra config |
| **Rate limiter** | Set `REDIS_URL` — shared counter in Redis, all instances count toward the same limit |
| **Monitor poller** | `pg_try_advisory_lock` leader election — only one instance polls per cycle, no extra config |
| **MCP SSE** | **Sticky session** required at the load balancer (see below) |

### Sticky session (at the LB)

The MCP SSE connection is long-lived; the same user's `/mcp/messages` POSTs must land on the instance that opened the SSE stream. Otherwise the client gets `502 session_on_other_instance` (tweetly detects this from the Redis registry and signals the operator) instead of "session not found".

Caddy / nginx / Traefik: hash-based sticky on the `Authorization` header, or cookie-based affinity, both work. In Coolify: enable "Session affinity".

### When is `REDIS_URL` required?

| Scenario | `REDIS_URL` |
|---|---|
| Single instance dev/prod | not required |
| 2+ instances | **required** (rate limit + MCP session registry) |

Use `redis://localhost:6379` or a Coolify-managed Redis service name.

### Verification

Bring up two instances and fire 31 PUT requests for the same user: the 30th and beyond must return 429 even when they hit the second instance (shared Redis counter). Without Redis, each instance has its own counter, so 60 requests would slip through.

Monitor poller: only one instance logs `Polling N monitor(s) (leader)`; the others log `skipped — another instance holds the leader lock`.

---

## Prometheus metrics

`GET /metrics` requires bearer auth (`secrets.admin_token`). Example Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: tweetly
    metrics_path: /metrics
    static_configs:
      - targets: ['api.your-domain.com:443']
    scheme: https
    bearer_token: <secrets.admin_token>
    # or bearer_token_file: /etc/prometheus/tweetly-token
```

Grafana Cloud free tier? Grafana Agent or Alloy accepts the same config.

| Metric | Type |
|---|---|
| `tweetly_action_total` | Counter |
| `tweetly_action_duration_ms` | Histogram |
| `tweetly_queue_depth` | Gauge |
| `tweetly_circuit_breaker_paused` | Gauge |

---

## License

[MIT](./LICENSE) © Furkan Beydemir.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development setup and PR conventions, and [`SECURITY.md`](./SECURITY.md) for vulnerability disclosure.
