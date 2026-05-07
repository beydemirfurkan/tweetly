# tweetly

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build](https://img.shields.io/badge/build-NestJS%2011%20%7C%20Next.js%2016-blue)](#mimari)

> **Live demo:** [tw-panel.beydemir.dev](https://tw-panel.beydemir.dev) — bağlanmak için kendi e-postanla magic link iste, kendi `tk_*` API key'ini üret.
> Production için **kendi sunucunda self-host** etmen önerilir; aşağıdaki "Coolify deploy" bölümüne bak.

X (Twitter) için MCP tabanlı aksiyon platformu. Geliştiriciler kendi yapay zeka ajanlarıyla (Claude Code, Codex, vb.) bağlanır, içeriği kendileri üretir; Tweetly de gönderim, etkileşim ve okuma aksiyonlarını çalıştırır.

İçerik üretimi ve senaryo yönetimi backend'de tutulmaz — Tweetly saf "X üzerinde aksiyon alma" katmanıdır.

## Disclaimer

Tweetly, X'in resmi public API'sini kullanmaz; bunun yerine **gerçek bir tarayıcı session'ı** (Patchright + saklanan cookie) ile X'i sürer. Bu tasarımın iki sonucu var:

1. **X'in Terms of Service'ini ihlal edebilir.** Otomasyon, üçüncü-taraf araçlarla session paylaşımı, yapay etkileşim — hepsi ToS gri/kırmızı bölgesidir. Hesap askıya alma riski tamamen kullanıcıdadır.
2. **Bilinen bir şirket altyapısı değildir.** Bu repo bir araştırma / kişisel-kullanım projesidir. Production'da müşteri hesaplarına yönlendirmeden önce risk değerlendirmesi yap.

Sorumluluk MIT lisansı uyarınca tamamen kullanıcıya aittir. Bkz. `LICENSE`.

## Mimari

**Stack:** NestJS 11, TypeScript, PostgreSQL + TypeORM, Patchright (anti-detection browser), MCP SDK.

```
src/
  accounts/          Hesap yönetimi (per-user X session token'ları)
  action-engine/     ClaimWorker, ExecutorRegistry, CircuitBreaker, RetryPolicy
                     GenericActionRepository (FOR UPDATE SKIP LOCKED)
  admin-api/         AdminApiController, AdminTokenGuard, AdminApiService
  content-memory/    Jaccard similarity dedup (opsiyonel)
  domain/            Port interface'leri, domain service'leri, action tipleri
  mcp/               MCP server (SSE transport, ~30 tool)
  monitoring/        Account monitor + webhook delivery
  observability/     HealthController, MetricsController (Prometheus)
  persistence/       TypeORM DataSource, Entity'ler, Migrations
  settings/          Per-account override destekli ayar servisi
  x-automation/      XBrowserService, XPostFlowService, SelectorRegistry
                     7 NoOp + 7 Patchright executor
  app.module.ts
  main.ts
```

### Action Engine

Her action tipi (`post`, `reply`, `like`, `bookmark`, `retweet`, `quote`, `follow`, `unlike`, `unretweet`, `unfollow`, `delete_tweet`, `dm`, `profile_update`, `avatar_update`, `banner_update`) ayrı bir Postgres tablosunda tutulur. `ClaimWorker` polling loop'u `FOR UPDATE SKIP LOCKED` ile claim alır; `ExecutorRegistry` doğru executor'a yönlendirir.

```
pending → claimed → running → succeeded
                           ↘ failed → pending (retry)
                                    ↘ dead
         ↘ cancelled (admin)
```

### MCP Tool Seti (özet)

- **Yazma:** `post_tweet`, `reply_to_tweet`, `like_tweet`, `retweet_tweet`, `quote_tweet`, `bookmark_tweet`, `follow_account`, `post_thread`
- **Geri alma / silme:** `unlike_tweet`, `unretweet_tweet`, `unfollow_account`, `delete_tweet`, `send_dm`, `update_profile`, `update_avatar`, `update_banner`
- **Okuma:** `search_tweets`, `get_user`, `get_tweet`, `get_user_tweets`, `search_users`, `get_user_followers`, `get_user_following`, `get_tweet_retweeters`, `get_tweet_quotes`, `get_tweet_replies`, `get_user_mentions`, `get_x_trending`
- **Yönetim:** `get_accounts`, `get_account_health`, `connect_x_account`, `reauth_x_account`, `get_x_login_job`, `list_actions`, `cancel_action`, `replay_action`, `get_settings`, `update_settings`
- **Monitor:** `create_monitor`, `list_monitors`, `get_monitor`, `delete_monitor`, `pause_monitor`

> **Breaking (2026-05-03):** `retweet` → `retweet_tweet`, `unretweet` → `unretweet_tweet`. Eski isimler `Unknown tool` döndürür.

---

## Kurulum

```bash
npm install
npm --prefix backend install --legacy-peer-deps
npm --prefix frontend install
npx patchright install chromium
cp .env.example .env
# .env içindeki ENCRYPTION_KEY'i doldur:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

docker compose up -d postgres
npm run db:migrate
```

---

## Komutlar

```bash
npm run build          # tsc → dist/
npm run dev:backend    # backend lokal geliştirme
npm run dev:frontend   # frontend lokal geliştirme
npm test               # backend unit testleri
npm run lint           # backend + frontend lint
npm run typecheck      # backend + frontend type-check

npm run db:migrate         # Migration'ları uygula
npm run db:migrate:revert  # Son migration'ı geri al
```

### Local smoke testleri

Production'a deploy etmeden önce MCP ve REST tool matrisini lokal backend'e
karşı çalıştır:

```bash
cd backend
TWEETLY_API_KEY=tk_... npm run smoke:mcp
TWEETLY_API_KEY=tk_... npm run smoke:rest

# X read path'lerini dahil et
TWEETLY_API_KEY=tk_... TWEETLY_SMOKE_SUITE=read npm run smoke:mcp
TWEETLY_API_KEY=tk_... TWEETLY_SMOKE_SUITE=read npm run smoke:rest

# Queue/write tool'ları bilinçli opt-in ister
TWEETLY_API_KEY=tk_... TWEETLY_SMOKE_SUITE=queue \
  TWEETLY_ALLOW_WRITE_SMOKE=true \
  TWEETLY_TARGET_TWEET_URL=https://x.com/.../status/... \
  npm run smoke:mcp
```

`destructive` suite (`delete_tweet`, `update_profile`, `send_dm`, `unfollow`,
vb.) sadece test hesabıyla ve `TWEETLY_ALLOW_DESTRUCTIVE_SMOKE=true` ile
çalıştırılmalı.

---

## Env Değişkenleri

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `X_EXECUTOR_MODE` | Evet | Gerçek gönderim için `patchright`; lokal dry-run için `noop` |
| `BOOTSTRAP_ADMIN_TOKEN` | İlk kurulumda | DB'de `secrets.admin_token` oluşturmak için geçici token |
| `DATABASE_URL` | Evet | PostgreSQL bağlantı URL'i |

Kalıcı admin token'ı DB'ye yaz, sonra env'den kaldır:

```bash
curl -X PUT -H "Authorization: Bearer $BOOTSTRAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"adminToken":"kalici-admin-token"}' \
  http://localhost:3001/admin/secrets
```

### Mail (SMTP) credential'larını DB'ye yaz

Magic-link maillerini göndermek için SMTP bilgileri **DB'de** yaşar — env'de
hiçbir SMTP değişkeni yok. Provider'ı (Postmark, Mailgun, SES, Gmail, vs.)
seçtikten sonra credential'ları aynı `/admin/secrets` endpoint'i üzerinden yaz:

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

Tweetly transporter'ı bir sonraki magic-link gönderiminde DB'den yeniden
kurar; yeniden başlatmaya gerek yok. Provider değiştirdiğinde aynı endpoint'le
güncelle, eski transporter düşer.

`mailProvider` `console` kalırsa magic link sadece backend log'una düşer
(yerel geliştirme için ideal).

X hesabını backend üzerinden güvenli login job ile bağla:

```bash
curl -X POST -H "Authorization: Bearer $TWEETLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"username":"foo","password":"x-password","email":"foo@example.com","totpSecret":null,"saveTotpSecret":false,"proxyCountry":"TR"}' \
  http://localhost:3001/api/v1/accounts/connect
```

Yanıt `202 Accepted` döner ve bir `jobId` verir. Durumu poll etmek için:

```bash
curl -H "Authorization: Bearer $TWEETLY_API_KEY" \
  http://localhost:3001/api/v1/accounts/login-jobs/$JOB_ID
```

Session bozulursa aynı hesabı yeniden doğrula:

```bash
curl -X POST -H "Authorization: Bearer $TWEETLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"x-password","email":"foo@example.com","totpSecret":null,"saveTotpSecret":false,"proxyCountry":"TR"}' \
  http://localhost:3001/api/v1/accounts/foo/reauth
```

Kullanıcıların `auth_token`, `ct0` veya `twid` kopyalaması gerekmez. Tweetly
X'e kendi tarayıcı otomasyonu ile giriş yapar, gerekli session cookie'lerini
backend tarafında alır ve saklar.

`proxyCountry` opsiyoneldir. Gönderilmezse backend `LOGIN_DEFAULT_PROXY_COUNTRY`
değerini, reauth sırasında varsa hesabın saklı `proxy_country` değerini kullanır.
X aynı sunucu IP'sinden gelen çoklu loginleri geçici olarak bloklayabildiği için
prod ortamda bölge bazlı egress/proxy tanımlamak önerilir:

```bash
LOGIN_DEFAULT_PROXY_COUNTRY=TR
LOGIN_FALLBACK_PROXY_COUNTRIES=US,DE
LOGIN_PROXY_TR=http://user:pass@tr.proxy.example:8080
LOGIN_PROXY_US=http://user:pass@us.proxy.example:8080
```

Login akışı X onboarding tarafında geçici "try again later" veya username
adımında ilerlememe hatası alırsa worker, yapılandırılmış ilk fallback proxy
ülkesiyle bir kez daha dener.

### Oturum ne zaman bozulur?

X session'ı süresi dolar veya X "yeni cihaz" tespiti yaparsa Patchright
auth-failure döndürür. Tweetly bunu otomatik olarak kaydeder:

- 1+ ardışık başarısızlık → Hesaplar listesinde **"Token süresi dolmuş?"**
  rozeti görünür (mouse-over ile son hata sebebi).
- 3 ardışık başarısızlık → hesap otomatik olarak `paused` durumuna alınır
  (kuyruktaki aksiyonlar tutulur, üretim bekler).

Bu noktada Hesaplar ekranındaki **Yeniden doğrula** akışıyla kullanıcı adı,
şifre ve gerekiyorsa 2FA secret bilgisi üzerinden yeni session açılır.

---

## MCP Bağlantısı (Claude Code örneği)

MCP `/mcp/sse` endpoint'i **kullanıcı `tk_*` API key'i** ile çalışır
(admin token değil). Her user kendi key'iyle bağlanır ve sadece kendi
hesaplarına erişir.

```bash
# tk_ key'i frontend → /login → magic-link → API Keys ekranından üret
claude mcp add tweetly --url http://localhost:3001/mcp/sse \
  --header "Authorization: Bearer $TWEETLY_API_KEY"   # tk_xxx...
```

Sonra Claude Code içinde: "Tweetly üzerinden 'merhaba' diye bir tweet at" denildiğinde `post_tweet` tool'u tetiklenir, action engine'e enqueue edilir, Patchright X üzerinde gönderir.

> **Auth modeli özet**:
> - `tk_*` user key → `/mcp/*`, `/api/v1/*` (kullanıcının kendi
>   hesapları, çok kullanıcılı)
> - `secrets.admin_token` → `/admin/*` (operatör/sysadmin uçları,
>   tüm kullanıcılar)
> İkisini karıştırma — MCP istemcisine asla admin token verme.

---

## Webhook HMAC doğrulama

Monitor oluşturduğunda response `webhookSecret` döner — sadece bir kez.
Webhook receiver'ın bu secret'la `X-Tweetly-Signature` başlığını doğrulamalı:

```js
// Express örneği
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

Secret'ı kaybedersen: `POST /api/v1/monitors/:id/rotate-secret` ile rotate et.

---

## Admin API

```bash
# Public
curl http://localhost:3001/health
curl http://localhost:3001/ready

# Durum / metrics (admin token gerekir)
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/status
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/metrics
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/queue/depth

# Action yönetimi
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" "http://localhost:3001/admin/actions?type=post&status=dead"
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/actions/post/UUID/replay
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/actions/post/UUID/cancel

# Manuel test gönderim
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"merhaba","account":"foo"}' \
  http://localhost:3001/admin/test/post
```

---

## Docker / Coolify Deploy

```bash
cp .env.example .env
docker compose up --build
```

| Volume | İçerik |
|---|---|
| `tweetly_state` | `/data` — session, media, logs |
| `tweetly_pgdata` | PostgreSQL veri dizini |

---

## Coolify deploy

### Servisler

| Servis | Tip | Notlar |
|---|---|---|
| `tweetly-backend` | Application (Dockerfile) | `backend/` dizini, `Dockerfile` build, port 3000 |
| `tweetly-frontend` | Application (Dockerfile) | `frontend/` dizini, build arg `NEXT_PUBLIC_API_URL=https://tw-backend.<domain>` |
| `tweetly-postgres` | Managed Postgres | Coolify add-on, 16-alpine, persistent volume |

### Backend env (Coolify → Environment Variables)

```env
DATABASE_URL=postgres://tweetly:tweetly@<coolify-postgres>:5432/tweetly
NODE_ENV=production
X_EXECUTOR_MODE=patchright
APP_URL=https://panel.yourdomain.com
CORS_ORIGINS=https://panel.yourdomain.com
BOOTSTRAP_ADMIN_TOKEN=<random-32-byte-hex>      # bir kerelik
BOOTSTRAP_ADMIN_EMAIL=you@yourdomain.com         # ilk user'ın maili
# REDIS_URL=redis://<coolify-redis>:6379         # 2+ instance'da gerekli
```

### Frontend env

```env
# Build arg (Coolify "Build Arguments" alanı):
NEXT_PUBLIC_API_URL=https://tw-backend.yourdomain.com
```

`tw-panel.*` ↔ `tw-backend.*` adlandırmasını kullanırsan `NEXT_PUBLIC_API_URL`'a
gerek yok, `lib/api.ts` runtime'da otomatik çıkartır. Farklı bir convention
ise build-arg zorunlu.

### Persistent volume

Backend container'ı `/data`'ya kalıcı volume bekliyor:
- `/data/user-data` — X session profile'ları (cookie kalıcılığı)
- `/data/app-data/{errors,logs}` — runtime artifact'lar

Patchright Chromium binary'si image içinde `/app/browsers` altında tutulur;
`/data` volume'una koyma, aksi halde Coolify volume mount image içindeki binary'yi gizler.

Coolify "Persistent Storage" → mount: `/data`.

### Bootstrap akışı (deploy sonrası, bir kerelik)

```bash
# 1. İlk admin user'ı yarat
curl -X POST -H "Authorization: Bearer $BOOTSTRAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@yourdomain.com"}' \
  https://tw-backend.yourdomain.com/admin/users

# 2. Kalıcı admin token + SMTP credentials yaz
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
  https://tw-backend.yourdomain.com/admin/secrets

# 3. BOOTSTRAP_ADMIN_TOKEN env'ini Coolify'dan kaldır, redeploy et
# 4. Frontend → /login → email gir → SMTP üzerinden gelen link → giriş
```

### Migration

Coolify "Run Command" sekmesinden:

```bash
npm run db:migrate
```

İlk deploy sonrası bir kez. Sonraki migration'larda her container start'ta
zaten startup'ta uygulanmaz — manuel çalıştırmak gerekiyor.

---

## Tek instance vs çoklu instance

Tweetly tek bir Node process'inde sıfır ek konfigürasyonla çalışır.
Yatay ölçekleme istiyorsan dikkat edilecek dört koordinasyon noktası
var; üçü kod tarafında halledildi, biri load balancer ayarı:

| Bileşen | Multi-instance ayarı |
|---|---|
| **Action ClaimWorker** | Postgres `FOR UPDATE SKIP LOCKED` ile zaten safe — ek ayar yok |
| **Rate limiter** | `REDIS_URL` set et — ortak counter Redis'te, tüm instance'lar aynı limit'e sayar |
| **Monitor poller** | `pg_try_advisory_lock` ile leader election — her cycle yalnız bir instance poll yapar, ek ayar yok |
| **MCP SSE** | Load balancer'da **sticky session** zorunlu (aşağı bakın) |

### Sticky session (LB tarafı)

MCP SSE bağlantısı uzun ömürlü; aynı kullanıcının `/mcp/messages` POST'ları
SSE'yi açtığı instance'a düşmek zorunda. Aksi halde "session not found"
yerine `502 session_on_other_instance` alırsın (Tweetly bunu Redis kaydından
tespit edip operatöre işaret eder).

Caddy / nginx / Traefik için `Authorization` header üzerinden hash-based
sticky veya cookie-based affinity yeterli. Coolify'da "Session affinity"
seçeneğini açman yeterli.

### REDIS_URL ne zaman gerekli?

| Senaryo | REDIS_URL |
|---|---|
| Tek instance dev/prod | gerekmez |
| 2+ instance | **gerekli** (rate limit + MCP session registry) |

Kurulum: `redis://localhost:6379` veya Coolify'da managed Redis service-name.

### Doğrulama

İki instance ayağa kaldır, aynı user için 31 PUT request at: ikinci
instance'da da 30. ve sonrası 429 dönmeli (Redis ortak counter). Tek
instance'da idi: ikinci instance'ın ayrı counter'ı olur, 60 isteğe
kadar geçerdi.

Monitor poller: log'larda yalnız bir instance "Polling N monitor(s)
(leader)" yazar, diğerleri "skipped — another instance holds the leader
lock" der.

---

## Prometheus Metrikleri

`GET /metrics` Bearer auth gerektirir (`secrets.admin_token`). Prometheus
scrape config örneği:

```yaml
scrape_configs:
  - job_name: tweetly
    metrics_path: /metrics
    static_configs:
      - targets: ['tw-backend.yourdomain.com:443']
    scheme: https
    bearer_token: <secrets.admin_token değeri>
    # veya bearer_token_file: /etc/prometheus/tweetly-token
```

Grafana Cloud free tier kullanıyorsan Grafana Agent veya Alloy aynı
config'i kabul eder.



| Metrik | Tür |
|---|---|
| `tweetly_action_total` | Counter |
| `tweetly_action_duration_ms` | Histogram |
| `tweetly_queue_depth` | Gauge |
| `tweetly_circuit_breaker_paused` | Gauge |
