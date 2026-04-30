# tweetly

X (Twitter) için MCP tabanlı aksiyon platformu. Geliştiriciler kendi yapay zeka ajanlarıyla (Claude Code, Codex, vb.) bağlanır, içeriği kendileri üretir; Tweetly de gönderim, etkileşim ve okuma aksiyonlarını çalıştırır.

İçerik üretimi ve senaryo yönetimi backend'de tutulmaz — Tweetly saf "X üzerinde aksiyon alma" katmanıdır.

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

Her action tipi (`post`, `reply`, `like`, `bookmark`, `retweet`, `quote`, `follow`) ayrı bir Postgres tablosunda tutulur. `ClaimWorker` polling loop'u `FOR UPDATE SKIP LOCKED` ile claim alır; `ExecutorRegistry` doğru executor'a yönlendirir.

```
pending → claimed → running → succeeded
                           ↘ failed → pending (retry)
                                    ↘ dead
         ↘ cancelled (admin)
```

### MCP Tool Seti (özet)

- **Yazma:** `post_tweet`, `reply_to_tweet`, `like_tweet`, `retweet`, `quote_tweet`, `bookmark_tweet`, `follow_account`, `post_thread`
- **Geri alma / silme:** `unlike_tweet`, `unretweet`, `unfollow_account`, `delete_tweet`, `send_dm`, `update_profile`
- **Okuma:** `search_tweets`, `get_user`, `get_tweet`, `get_user_tweets`, `search_users`, `get_user_followers`, `get_x_trending`
- **Yönetim:** `get_accounts`, `get_status`, `get_queue_depth`, `list_actions`, `cancel_action`, `replay_action`
- **Monitor:** `create_monitor`, `list_monitors`, `get_monitor`, `delete_monitor`, `pause_monitor`

---

## Kurulum

```bash
npm install
npx patchright install chromium
cp .env.example .env

docker compose up -d postgres
npm run db:migrate
```

---

## Komutlar

```bash
npm run build          # tsc → dist/
npm start              # node dist/main.js  (prod)
npm run dev            # tsx src/main.ts    (lokal geliştirme)
npm test               # jest

npm run db:migrate         # Migration'ları uygula
npm run db:migrate:revert  # Son migration'ı geri al
```

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

X hesabını manuel token-paste ile bağla:

```bash
curl -X PUT -H "Authorization: Bearer $TWEETLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Foo","authToken":"x-auth-token","ct0":"x-ct0","twid":"x-twid","status":"active"}' \
  http://localhost:3001/api/v1/accounts/foo
```

### X cookie'leri nasıl alınır?

Tweetly Twitter API kullanmaz; bunun yerine tarayıcıda zaten açık olan
oturumun cookie'leriyle hareket eder. Bu yüzden ücretsiz / quotasız.

1. Chrome / Firefox / Edge'de https://x.com'a normalce giriş yap.
2. DevTools → Application (Chrome) ya da Storage (Firefox) → Cookies → `https://x.com`.
3. Şu üçünün **Value** kolonunu kopyala:
   - `auth_token`  → `authToken`
   - `ct0`        → `ct0`
   - `twid`       → `twid`
4. Panel → Hesaplar → Yeni hesap formuna yapıştır.

> Tek tek cookie kopyalamak yerine "EditThisCookie" / "Cookie-Editor"
> gibi bir uzantıyla `x.com` cookie'lerini JSON olarak dışa aktarıp
> oradan da değerleri alabilirsin. Tweetly cookie'leri kalıcı olarak
> tutar; sadece X tarafında aynı oturum açık kaldığı sürece geçerlidir.

### Oturum ne zaman bozulur?

Cookie'ler süresi dolar veya X "yeni cihaz" tespiti yaparsa Patchright
auth-failure döndürür. Tweetly bunu otomatik olarak kaydeder:

- 1+ ardışık başarısızlık → Hesaplar listesinde **"Token süresi dolmuş?"**
  rozeti görünür (mouse-over ile son hata sebebi).
- 3 ardışık başarısızlık → hesap otomatik olarak `paused` durumuna alınır
  (kuyruktaki aksiyonlar tutulur, üretim bekler).

Bu noktada tarayıcıdan yeni cookie'leri alıp hesabı güncellemek yeterli.

---

## MCP Bağlantısı (Claude Code örneği)

```bash
claude mcp add tweetly --url http://localhost:3001/mcp/sse \
  --header "Authorization: Bearer $ADMIN_API_TOKEN"
```

Sonra Claude Code içinde: "Tweetly üzerinden 'merhaba' diye bir tweet at" denildiğinde `post_tweet` tool'u tetiklenir, action engine'e enqueue edilir, Patchright X üzerinde gönderir.

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
curl http://localhost:3001/metrics

# Durum
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/status
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
| `tweetbot_state` | `/data` — session, media, logs |
| `tweetly_pgdata` | PostgreSQL veri dizini |

---

## Prometheus Metrikleri

`GET /metrics` (Bearer auth):

| Metrik | Tür |
|---|---|
| `tweetly_action_total` | Counter |
| `tweetly_action_duration_ms` | Histogram |
| `tweetly_queue_depth` | Gauge |
| `tweetly_circuit_breaker_paused` | Gauge |
