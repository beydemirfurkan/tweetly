# tweetly

[![CI](https://github.com/beydemirfurkan/tweetly/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/beydemirfurkan/tweetly/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stack](https://img.shields.io/badge/stack-NestJS%2011%20%7C%20Next.js%2016-blue)](#architecture)
[![Status](https://img.shields.io/badge/status-public%20beta-orange)](#project-status)

Self-hosted automation layer for X (Twitter), built around the **Model Context Protocol**. Bring your own AI agent — Claude Code, Cursor, Codex, anything that speaks MCP — and tweetly executes the post / engage / read actions on X through a real browser session, not the public API.

> **Live demo:** [tw-panel.beydemir.dev](https://tw-panel.beydemir.dev) — request a magic link with your email, mint a `tk_*` API key, plug it into your MCP client.
> For production, **self-host on your own infrastructure** — see [Deploy](#deploy) below.

---

## Table of contents

- [Disclaimer](#disclaimer)
- [Project status](#project-status)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [MCP tool surface](#mcp-tool-surface)
- [Setup](#setup)
- [Commands](#commands)
- [Smoke tests](#smoke-tests)
- [Environment variables](#environment-variables)
- [Connect an X account](#connect-an-x-account)
- [API key onboarding](#api-key-onboarding)
- [MCP connection](#mcp-connection)
- [Webhook HMAC verification](#webhook-hmac-verification)
- [Admin API](#admin-api)
- [Deploy](#deploy)
- [Multi-instance scaling](#multi-instance-scaling)
- [Observability](#observability)
- [Contributing](#contributing)
- [Acknowledgments](#acknowledgments)
- [License](#license)

---

## Disclaimer

tweetly does **not** use X's official public API. It drives X through a real browser session (Patchright + persisted cookies). Two consequences follow:

1. **It may violate X's Terms of Service.** Automation, third-party session sharing, and synthetic engagement all sit in ToS gray/red territory. Account suspension risk is on you.
2. **This is not a vetted enterprise product.** The repository is a research / personal-use project. Run a risk assessment before pointing it at customer accounts in production.

All liability remains with the user under the MIT License — see [`LICENSE`](./LICENSE).

---

## Project status

Public beta. The auth, action engine, MCP, and REST surfaces are stable; breaking changes are documented in [`CHANGELOG.md`](./CHANGELOG.md). Coverage: 403 unit tests + 24 integration tests on every push.

**MCP clients verified against this build:**
- Claude Code (CLI)
- Claude Desktop
- Cursor (via MCP HTTP transport)
- ChatGPT custom GPT actions (REST)
- Generic MCP clients via `/mcp/sse`

**Known weak spots** are tracked as labeled issues — see [open issues](https://github.com/beydemirfurkan/tweetly/issues) and especially [`security`](https://github.com/beydemirfurkan/tweetly/issues?q=is%3Aopen+label%3Asecurity) and [`good first issue`](https://github.com/beydemirfurkan/tweetly/issues?q=is%3Aopen+label%3A%22good+first+issue%22) for current priorities.

---

## Quick start

Get a local dev instance posting noop actions in under five minutes.

```bash
# 1. Clone and install
git clone https://github.com/beydemirfurkan/tweetly.git
cd tweetly
npm install
npm --prefix backend install --legacy-peer-deps
npm --prefix frontend install
npx patchright install chromium

# 2. Generate a 32-byte master key, then paste it into ENCRYPTION_KEY in .env
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. Start postgres and apply migrations
docker compose up -d postgres
npm run db:migrate

# 4. Run backend + frontend
npm run dev:backend   # http://localhost:3001
npm run dev:frontend  # http://localhost:3000
```

Open `http://localhost:3000`, request a magic link with your email (the link is logged to backend stdout in dev), and mint a `tk_*` API key from the panel.

For real X delivery, set `X_EXECUTOR_MODE=patchright` and connect an X account; for dry runs, leave it as `noop`. See [Connect an X account](#connect-an-x-account) for the full server-side login flow.

---

## Architecture

**Stack:** NestJS 11, TypeScript, PostgreSQL + TypeORM, Patchright (anti-detection browser), Model Context Protocol SDK, Next.js 16, React 19, Tailwind v4.

### High-level flow

```mermaid
flowchart LR
    Client["AI agent<br/>(Claude Code, Cursor, ...)"]
    Panel["Panel<br/>(Next.js 16)"]

    subgraph Backend["NestJS backend"]
        direction TB
        Guard["ApiKeyGuard<br/>(tk_* user keys)"]
        REST["REST · /api/v1/*"]
        MCP["MCP · /mcp/sse"]
        Engine["Action engine<br/>(claim · retry · circuit breaker)"]
        Browser["XBrowserService<br/>+ executors (Patchright)"]
    end

    DB[("PostgreSQL<br/>(actions, accounts,<br/>monitors, jobs)")]
    X[("X · twitter.com")]
    Webhook["Tenant webhook<br/>receivers"]

    Client -- "MCP / Bearer tk_*" --> Guard
    Panel -- "REST / Bearer tk_*" --> Guard
    Guard --> REST
    Guard --> MCP
    REST --> Engine
    MCP --> Engine
    Engine --> Browser
    Engine <--> DB
    Browser --> X
    Engine -- "monitor events" --> Webhook
```

### Post-tweet sequence

```mermaid
sequenceDiagram
    autonumber
    participant Agent as AI agent
    participant API as Backend API
    participant Q as Action queue (Postgres)
    participant W as ClaimWorker
    participant X as Patchright → X

    Agent->>API: post_tweet(text, account)<br/>Authorization: Bearer tk_*
    API->>API: ApiKeyGuard verifies key<br/>resolves userId, accountId
    API->>Q: INSERT post_actions (pending)
    API-->>Agent: 202 { id, idempotencyKey }
    loop every WORKER_POLL_MS
        W->>Q: SELECT FOR UPDATE SKIP LOCKED
        Q-->>W: claim row → status=claimed
        W->>X: launch context, navigate, post
        alt success
            X-->>W: tweet URL
            W->>Q: status=succeeded
        else transient failure
            W->>Q: status=pending (retry, backoff)
        else permanent failure
            W->>Q: status=dead
        end
    end
```

### Project layout

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

frontend/src/
  app/[locale]/      Next.js 16 panel (i18n: tr/en)
  components/        Shadcn-based UI
  i18n/              next-intl config
  lib/               API client, auth context, hooks
```

### Action state machine

```
pending → claimed → running → succeeded
                           ↘ failed → pending (retry)
                                    ↘ dead
         ↘ cancelled (admin)
```

Every action type (`post`, `reply`, `like`, `bookmark`, `retweet`, `quote`, `follow`, `unlike`, `unretweet`, `unfollow`, `delete_tweet`, `dm`, `profile_update`, `avatar_update`, `banner_update`) lives in its own Postgres table for predictable indexes, idempotency keys, and per-type metrics.

---

## MCP tool surface

Same Zod schemas back the MCP and REST surfaces, so a tool name in MCP maps 1:1 to a route in REST.

**Write (queue-backed):** `post_tweet` · `reply_to_tweet` · `like_tweet` · `retweet_tweet` · `quote_tweet` · `bookmark_tweet` · `follow_account` · `post_thread` · `unlike_tweet` · `unretweet_tweet` · `unfollow_account` · `delete_tweet` · `send_dm` · `update_profile` · `update_avatar` · `update_banner`

**Read (synchronous):** `search_tweets` · `get_user` · `get_tweet` · `get_user_tweets` · `search_users` · `get_user_followers` · `get_user_following` · `get_tweet_retweeters` · `get_tweet_quotes` · `get_tweet_replies` · `get_user_mentions` · `get_x_trending` · `get_user_likes` · `get_my_bookmarks` · `get_thread` · `get_mutual_followers` · `get_user_lists` · `get_list` · `get_list_members` · `get_list_subscribers`

**Bulk extractions (async, file output):** `create_extraction` · `get_extraction` · `list_extractions` · `cancel_extraction`

**Management:** `get_accounts` · `get_account_health` · `connect_x_account` · `reauth_x_account` · `get_x_login_job` · `list_actions` · `cancel_action` · `replay_action` · `get_settings` · `update_settings`

**Monitor:** `create_monitor` · `list_monitors` · `get_monitor` · `rotate_secret` · `delete_monitor` · `pause_monitor`

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

---

## Smoke tests

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

The `destructive` suite (`delete_tweet`, `update_profile`, `send_dm`, `unfollow`, ...) only runs against a throwaway test account with `TWEETLY_ALLOW_DESTRUCTIVE_SMOKE=true`.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `ENCRYPTION_KEY` | Yes | 32-byte base64 master key for AES-256-GCM credential encryption |
| `X_EXECUTOR_MODE` | Yes | `patchright` for real X delivery; `noop` for local dry-runs |
| `BOOTSTRAP_ADMIN_TOKEN` | First boot | Temporary token used to seed `secrets.admin_token` in the DB |
| `BOOTSTRAP_ADMIN_EMAIL` | First boot | Email of the first admin user to create |
| `CORS_ORIGINS` | Production | Comma-separated origin allowlist (empty rejects all) |
| `REDIS_URL` | Multi-instance | Required when running 2+ backend replicas |
| `AI_COPILOT_ADMIN_EMAILS` | Optional | Comma-separated emails authorized for the AI Copilot module (empty disables) |
| `TRUST_PROXY` | Optional | `app.set('trust proxy', ...)` value for IP-based rate limit accuracy behind a reverse proxy |

After first boot, write a permanent admin token to the DB and remove `BOOTSTRAP_ADMIN_TOKEN`:

```bash
curl -X PUT -H "Authorization: Bearer $BOOTSTRAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"adminToken":"<another-random-32-byte-hex>"}' \
  http://localhost:3001/admin/secrets
```

### SMTP credentials live in the database

Magic-link emails ship through SMTP. **No SMTP variables are read from env** — credentials live in the DB via `PUT /admin/secrets`. Pick a provider (Postmark, Mailgun, SES, Gmail, ...) and write the credentials in:

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
    "mailFrom": "tweetly <noreply@yourdomain.com>"
  }' \
  http://localhost:3001/admin/secrets
```

The transporter rebuilds on the next magic-link send — no restart needed. Updating credentials at the same endpoint cycles the previous transporter automatically. If `mailProvider` stays `console` (the default), magic links are written to backend stdout — ideal for local dev.

---

## Connect an X account

tweetly logs into X through its own browser automation; users never copy `auth_token` / `ct0` / `twid`. Kick off a server-side login job:

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

### Session expiry semantics

- **1+ consecutive auth failures** — an "Expired token?" badge appears on the Accounts list (hover for the last error reason).
- **3 consecutive auth failures** — the account is auto-`paused`. Queued actions are held; production stalls until you re-authenticate from the panel.

---

## API key onboarding

The panel is the canonical place to mint and manage `tk_*` keys.

1. **Request a magic link.** Visit `http://localhost:3000` (or your panel domain), enter your email. In dev with `mailProvider=console`, copy the link from backend logs. In prod, click the link in the email.
2. **Verify the link.** Hitting the URL opens `/auth/verify`, which exchanges the token for a panel session.
3. **Mint a key.** Open the API Keys page, click **Create**, give it a label, copy the `tk_*` value — it is shown once.
4. **Use the key.** Send `Authorization: Bearer tk_...` to any `/api/v1/*` endpoint or the `/mcp/sse` connection.
5. **Revoke when needed.** The panel lists every key with last-used timestamp; revoke compromises immediately.

> **Auth model summary**
> - `tk_*` user keys → `/mcp/*`, `/api/v1/*` (the user's own accounts, multi-tenant)
> - `secrets.admin_token` → `/admin/*` (operator/sysadmin endpoints, all users)
>
> Never hand the admin token to an MCP client.

---

## MCP connection

```bash
# After minting a tk_* key from the panel:
claude mcp add tweetly --url http://localhost:3001/mcp/sse \
  --header "Authorization: Bearer $TWEETLY_API_KEY"
```

Then, inside your agent: "Post 'hello world' through tweetly" triggers `post_tweet`, the action engine enqueues it, and Patchright publishes on X.

---

## Webhook HMAC verification

When you create a monitor, the response includes `webhookSecret` — shown once. Your webhook receiver must verify the `X-Tweetly-Signature` header:

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
```

---

## Deploy

### Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

| Volume | Contents |
|---|---|
| `tweetly_state` | `/data` — sessions, media, logs |
| `tweetly_pgdata` | PostgreSQL data directory |

### Coolify

| Service | Type | Notes |
|---|---|---|
| `tweetly-backend` | Application (Dockerfile) | `backend/` directory, `Dockerfile` build, port 3000 |
| `tweetly-frontend` | Application (Dockerfile) | `frontend/` directory, build arg `NEXT_PUBLIC_API_URL=https://api.your-domain.com` |
| `tweetly-postgres` | Managed Postgres | Coolify add-on, 16-alpine, persistent volume |

**Backend env:**

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

**Frontend build arg:**

```env
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

If you keep the `panel.*` ↔ `api.*` naming convention, `NEXT_PUBLIC_API_URL` can be omitted — `lib/api.ts` derives it at runtime. Any other convention requires the build arg.

**Persistent volume.** The backend container mounts `/data`:
- `/data/user-data` — X session profiles (cookie persistence)
- `/data/app-data/{errors,logs}` — runtime artifacts

The Patchright Chromium binary lives at `/app/browsers` inside the image. **Don't mount `/data` over `/app/browsers`** — Coolify volume mounts shadow the in-image binary. In Coolify, set "Persistent Storage" → mount `/data`.

**Bootstrap (one-time, post-deploy):**

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
    "mailFrom": "tweetly <noreply@yourdomain.com>"
  }' \
  https://api.your-domain.com/admin/secrets

# 3. Remove BOOTSTRAP_ADMIN_TOKEN from Coolify env, redeploy
# 4. Frontend → /login → enter email → click magic link → in
```

**Migrations.** From Coolify "Run Command":

```bash
npm run db:migrate
```

Run once after the first deploy. Subsequent migrations don't auto-apply on container start — run the command manually.

---

## Multi-instance scaling

tweetly runs in a single Node process with zero extra configuration. To scale horizontally there are four coordination points; three are handled in code, the fourth is a load-balancer setting:

| Component | Multi-instance setup |
|---|---|
| Action ClaimWorker | Postgres `FOR UPDATE SKIP LOCKED` already safe — no extra config |
| Rate limiter | Set `REDIS_URL` — shared counter, all instances count toward the same limit |
| Monitor poller | `pg_try_advisory_lock` leader election — only one instance polls per cycle |
| MCP SSE | **Sticky session** required at the load balancer (see below) |

**Sticky session.** The MCP SSE connection is long-lived; the same user's `/mcp/messages` POSTs must land on the instance that opened the SSE stream. Hash-based sticky on `Authorization` or cookie-based affinity in Caddy / nginx / Traefik is enough; Coolify's "Session affinity" toggle does the same.

**REDIS_URL.** Required when running 2+ instances (rate limit + MCP session registry). Single-instance dev/prod falls back to in-memory.

**Verify multi-instance.** Bring up two instances and fire 31 PUT requests for the same user: the 30th and beyond must return 429 even when they hit the second instance (shared Redis counter). Without Redis, each instance has its own counter, so 60 requests would slip through. Monitor poller: only one instance logs `Polling N monitor(s) (leader)`.

---

## Observability

`GET /metrics` requires bearer auth (`secrets.admin_token`). Example Prometheus scrape:

```yaml
scrape_configs:
  - job_name: tweetly
    metrics_path: /metrics
    static_configs:
      - targets: ['api.your-domain.com:443']
    scheme: https
    bearer_token: <secrets.admin_token>
```

| Metric | Type |
|---|---|
| `tweetly_action_total` | Counter |
| `tweetly_action_duration_ms` | Histogram |
| `tweetly_queue_depth` | Gauge |
| `tweetly_circuit_breaker_paused` | Gauge |

Grafana Cloud free tier? Grafana Agent or Alloy accepts the same config. See [`docs/12-queue-alarms.md`](./docs/12-queue-alarms.md) for alert templates calibrated against the queue metrics.

---

## Contributing

Issues and pull requests welcome. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development setup and PR conventions, and [`SECURITY.md`](./SECURITY.md) for the vulnerability-disclosure process.

- [Open issues](https://github.com/beydemirfurkan/tweetly/issues) — tagged by area, severity, and difficulty
- [`good first issue`](https://github.com/beydemirfurkan/tweetly/issues?q=is%3Aopen+label%3A%22good+first+issue%22) — scoped tasks for new contributors
- [`security`](https://github.com/beydemirfurkan/tweetly/issues?q=is%3Aopen+label%3Asecurity) — open security reviews
- [Changelog](./CHANGELOG.md)

The `main` branch is protected: pull requests require a passing CI run (`backend` and `frontend` jobs) and one approving review. Conventional Commits are documented in `CONTRIBUTING.md`.

---

## Acknowledgments

Built on the shoulders of:

- [**Patchright**](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) — anti-detection Playwright fork that does the heavy lifting against X's bot defenses.
- [**Model Context Protocol SDK**](https://github.com/modelcontextprotocol/typescript-sdk) — the spec and reference server that makes MCP integration ergonomic.
- [**NestJS**](https://nestjs.com/) — the backend framework that keeps the modular boundaries honest.
- [**TypeORM**](https://typeorm.io/) — the data layer behind the action engine queue.
- [**Next.js**](https://nextjs.org/) and [**Shadcn**](https://ui.shadcn.com/) — the panel framework and component library.
- [**nodemailer**](https://nodemailer.com/) — magic-link delivery.
- [**prom-client**](https://github.com/siimon/prom-client) — Prometheus metrics export.

---

## License

[MIT](./LICENSE) © Furkan Beydemir.

[Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Changelog](./CHANGELOG.md) · [Issues](https://github.com/beydemirfurkan/tweetly/issues) · [Releases](https://github.com/beydemirfurkan/tweetly/releases)
