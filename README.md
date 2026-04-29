# tweetly

X (Twitter) otomasyon botu. GitHub Trending repo'larından AI ile Türkçe tweet üretir ve gün içine zamanlanmış aralıklarla yayınlar. Çoklu hesap ve çoklu senaryo (GitHub Trending, Wallpaper, vb.) desteği vardır.

## Mimari

**Stack:** NestJS 11, TypeScript, PostgreSQL + TypeORM, Patchright (anti-detection browser), OpenRouter (AI).

```
src/
  accounts/          Hesap yönetimi
  action-engine/     ClaimWorker, ExecutorRegistry, CircuitBreaker, RetryPolicy
                     GenericActionRepository (FOR UPDATE SKIP LOCKED)
  admin-api/         AdminApiController, AdminTokenGuard, AdminApiService
  analytics/         Analytics event store ve format performans sorguları
  content-generation/ OpenRouterService (AI), MediaService, PromptRegistry (8 format)
  content-memory/    Jaccard similarity + hash dedup (tekrar içerik engeli)
  domain/            Port interface'leri, domain service'leri, action/content tipleri
  observability/     HealthController, MetricsController (Prometheus), MetricsService
  persistence/       TypeORM DataSource, Entity'ler (7 action tablosu), Migrations
  settings/          Per-account override destekli anahtar-değer ayar servisi
  trending-source/   GithubTrendingSource (cheerio scraper)
  workflows/         GithubTrendingWorkflow, WallpaperWorkflow, WorkflowDispatchService
  x-automation/      XBrowserService, XPostFlowService, SelectorRegistry
                     7 NoOp + 7 Patchright executor (post/reply/like/bookmark/retweet/quote/follow)
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

### Senaryo Sistemi

Her hesap `scenario.type` ayarıyla farklı bir içerik pipeline'ına bağlanır.

| Senaryo | Açıklama |
|---|---|
| `github_trending` | GitHub Trending → AI tweet (8 format, adaptive ağırlık) |
| `wallpaper` | Reddit top image → media_path dolu post (caption opsiyonel) |

Aynı senaryo birden fazla hesapta kullanılabilir; per-account ayarlar birbirini etkilemez.

---

## Kurulum

```bash
npm install
npx patchright install chromium
cp .env.example .env   # değerleri doldur

# Postgres başlat (Docker Compose)
docker compose up -d postgres

# Şema migration'larını uygula
npm run db:migrate

# X session import (ilk çalıştırma)
# Tarayıcıdan auth_token cookie'sini .env içine X_AUTH_TOKEN olarak yaz.
```

---

## Komutlar

```bash
npm run build          # tsc → dist/
npm start              # node dist/main.js  (prod)
npm run dev            # tsx src/main.ts    (lokal geliştirme)
npm test               # jest

# Veritabanı
npm run db:migrate         # Migration'ları uygula
npm run db:migrate:revert  # Son migration'ı geri al
npm run db:migrate:legacy  # SQLite → Postgres veri taşıma (tek seferlik)

# Debug / Smoke
npm run smoke:engine       # Action engine smoke testi
```

---

## Env Değişkenleri

`.env.example` sadece boot-time değerleri içerir. Account cookie'leri, OpenRouter API key ve kalıcı admin token DB üzerinden yönetilir.

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `X_EXECUTOR_MODE` | Evet | Gerçek gönderim için `patchright`; lokal dry-run için `noop` |
| `BOOTSTRAP_ADMIN_TOKEN` | İlk kurulumda | DB'de `secrets.admin_token` oluşturmak için geçici token |
| `DATABASE_URL` | Evet | PostgreSQL bağlantı URL'i |

Prod'da tek DB env yeterli:

```env
DATABASE_URL=postgres://user:password@host:port/database
```

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` sadece lokal compose fallback'i için desteklenir; prod env'e eklemeye gerek yok.

Kalıcı secret'ları Admin API ile DB'ye yaz:

```bash
curl -X PUT -H "Authorization: Bearer $BOOTSTRAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"adminToken":"kalici-admin-token","openrouterApiKey":"sk-or-v1-..."}' \
  http://localhost:3001/admin/secrets

curl -X PUT -H "Authorization: Bearer kalici-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Test Account","authToken":"x-auth-token","ct0":"x-ct0","status":"active"}' \
  http://localhost:3001/admin/accounts/test-account
```

`secrets.admin_token` DB'de oluşunca `BOOTSTRAP_ADMIN_TOKEN` env'den kaldırılabilir.

---

## Health & Admin API

Tüm `/admin/*` endpoint'leri DB'deki `secrets.admin_token` ile `Authorization: Bearer $ADMIN_API_TOKEN` veya `X-Admin-Token: $ADMIN_API_TOKEN` header'ı gerektirir. İlk kurulumda DB token oluşana kadar `BOOTSTRAP_ADMIN_TOKEN` kullanılabilir.

```bash
# Public
curl http://localhost:3001/health
curl http://localhost:3001/metrics   # Prometheus scrape endpoint

# Durum
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/status
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/queue/depth

# Collect tetikleme
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/collect
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" "http://localhost:3001/admin/collect?account=acc-id"

# Action yönetimi
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" "http://localhost:3001/admin/actions?type=post&status=dead"
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/actions/post/UUID/replay
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/actions/post/UUID/cancel

# Ayarlar (global)
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/settings
curl -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tweets_per_day": 15}' \
  http://localhost:3001/admin/settings

# Ayarlar (hesap bazlı)
curl -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scenario.type": "wallpaper", "_accountId": "acc-id"}' \
  http://localhost:3001/admin/settings
```

---

## Çoklu Hesap & Senaryo

Her hesap bağımsız çalışır: ayrı slot limiti, ayrı content memory, ayrı circuit breaker.

**Hesap senaryosu atama:**
```bash
# Hesabı wallpaper senaryosuna al
curl -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scenario.type": "wallpaper", "scenario.wallpaper.subreddit": "earthporn", "_accountId": "acc-id"}' \
  http://localhost:3001/admin/settings

# Tüm hesapları tetikle (her biri kendi senaryosunu çalıştırır)
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/admin/collect
```

**Ayarlanabilir senaryo parametreleri:**

| Anahtar | Default | Açıklama |
|---|---|---|
| `scenario.type` | `github_trending` | Hesap senaryosu |
| `scenario.wallpaper.subreddit` | `wallpaper` | Reddit subreddit |
| `scenario.wallpaper.per_day` | `3` | Günlük paylaşım sayısı |
| `scenario.wallpaper.caption_template` | `''` | Post caption (boş = caption'sız) |
| `tweets_per_day` | `20` | GitHub trending günlük tweet sayısı |
| `auto_collect.enabled` | `false` | Prod'da günlük içerik toplama otomasyonu (canary sonrası açılır) |
| `auto_collect.run_hour` | `8` | Günlük otomatik içerik toplama saati |
| `auto_collect.run_minute` | `0` | Günlük otomatik içerik toplama dakikası |
| `source_expansion.enabled` | `true` | Hacker News ve dev.to destek kaynaklarını açar |
| `source_expansion.max_daily_candidates` | `5` | Günlük harici kaynak aday limiti |
| `source_expansion.min_score` | `75` | Harici kaynak kalite eşiği |

---

## Docker / Coolify Deploy

### docker compose (lokal)

```bash
cp .env.example .env   # DB_* ve diğer değerleri doldur
docker compose up --build
```

`tweetbot` servisi `postgres` servisinin sağlıklı olmasını bekler (`depends_on: condition: service_healthy`). Kalıcı volume'lar:

| Volume | İçerik |
|---|---|
| `tweetbot_state` | `/data` — session, media, logs |
| `tweetly_pgdata` | PostgreSQL veri dizini |

### Coolify adımları

1. **New Resource → Application → Public Repository → Dockerfile**
2. Repo: `https://github.com/beydemirfurkan/tweetly`, Branch: `main`
3. **Persistent Storage**: `/data`
4. **Environment Variables**: `.env.example` içindeki boot-time değerleri gir.
5. PostgreSQL bağlantısını `DATABASE_URL` olarak gir.
6. Deploy sonrası `/admin/secrets` ve `/admin/accounts/:id` endpoint'leriyle kalıcı secret/account bilgilerini DB'ye yaz.

---

## Prometheus Metrikleri

`GET /metrics` endpoint'i (Bearer auth gerektirir) şu metrikleri döküyor:

| Metrik | Tür | Açıklama |
|---|---|---|
| `tweetly_action_total` | Counter | Tip ve durum bazlı action sayısı |
| `tweetly_action_duration_ms` | Histogram | Executor çalışma süresi |
| `tweetly_queue_depth` | Gauge | Tip ve status bazlı kuyruk derinliği |
| `tweetly_circuit_breaker_paused` | Gauge | Pause'daki hesap sayısı |

---

## Geliştirme

```bash
# Test
npx jest
npx jest --watch

# Yeni senaryo eklemek
# 1. src/workflows/<isim>.workflow.ts → implements IContentWorkflow
# 2. src/workflows/workflows.module.ts → providers + exports'a ekle
# 3. src/workflows/workflow-dispatch.service.ts → constructor'daki Map'e kaydet
# 4. src/settings/settings.service.ts → DEFS'e senaryo ayarlarını ekle
```
