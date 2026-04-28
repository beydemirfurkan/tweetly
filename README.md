# tweetly

GitHub Trending'den AI/coding odaklı repoları çekip OpenRouter ile Türkçe tweet metni üreten ve gün içine zamanlanmış aralıklarla X'e (Twitter) yayınlayan otomasyon botu.

## Akış

1. Her gün **09:00** — `collect`: GitHub Trending scrape → dedup → scoring → günlük limite (default 13) göre Türkçe tweet üret → SQLite kuyruğuna yaz. Tweet'ler ağırlıklı saat dağılımına göre 45 dk + 15-45 dk jitter ile planlanır.
2. Her **5 dakika** — `dispatch`: vakti gelen 1 tweeti X'e atar, `tweets` tablosunda `status='sent'` olarak işaretler.
3. Queue'da gönderilecek tweet kalmazsa orchestrator otomatik refill yapar; boş/başarısız refill sonrası 30 dk cooldown uygular.
4. Arka arkaya 3 post hatası olursa circuit breaker 60 dk pause eder.
5. `content_memory` tablosu aynı/çok benzer tweet kalıplarını tekrar üretmeyi engeller (Jaccard similarity + hash dedup).
6. **Adaptive format**: Son 14 günlük başarı oranına göre format ağırlıkları otomatik ayarlanır.

## Kurulum

```bash
npm install
npx patchright install chromium
cp .env.example .env  # değerleri doldur
npm run import-session # X cookie'lerini user-data/'ya import eder
```

## Komutlar

```bash
npm start          # Long-running orchestrator — derlenmiş dist'ten (prod)
npm run dev        # Long-running orchestrator — tsx ile (lokal)
npm run collect    # Manuel: trending çek + tweet üret + queue (tsx)
npm run dispatch   # Manuel: vakti gelen 1 tweeti at (tsx)
npm run login      # X'e password ile login (headful browser)
npm run manual-login # X'e manuel login (kullanıcı browser'da login olur)
npm run import-session # X cookie'lerini browser profiline import et (tsx)
npm run tweet -- "metin"   # Tek seferlik manuel tweet (tsx)
npm run report     # Haftalık analytics raporu (tsx)
npm run migrate    # Eski JSON verilerini SQLite'a taşır (tsx)
```

## Yapı

Proje TypeScript (CommonJS, target ES2022). Lokal'de `tsx`, prod'da derlenmiş `dist/` çalışır. Veri saklama: **SQLite** (better-sqlite3, WAL mode).

```
src/
  core/        browser, login, postTweet (patchright anti-detection)
  sources/     githubTrending.ts (cheerio scrape)
  ai/          openrouter.ts + prompts.ts (AI tweet generation)
  pipeline/    collect.ts, dispatch.ts
  storage/     SQLite tables: tweets, content_memory, control_state,
               analytics_events, settings, accounts
  content/     strategy.ts (format mix), scoring.ts (repo scoring),
               topics.ts (topic inference)
  ops/         healthServer.ts (HTTP API), runtime.ts (state), report.ts
  config/      env validation + sabitler
  types/       domain tipleri
  utils/       logger (console + data/logs/YYYY-MM-DD.log)
  scripts/     migrateJsonToDb.ts
  index.ts     node-cron orchestrator
data/
  tweetly.db         SQLite veritabanı (tweets, settings, analytics, etc.)
  media/             İndirilen OG image dosyaları
  logs/              Günlük rotated log dosyaları
  errors/            Hata anı tarayıcı screenshot'ları
```

## Build

```bash
npm run build   # tsc → dist/
npm start       # node dist/index.js (Coolify/prod entry)
```

## Env

Bkz. `.env.example`. Kritik: `OPENROUTER_API_KEY` ve X session için `X_AUTH_TOKEN`.
Default model: `google/gemini-2.5-flash`.

### X Session (Cookie-based)

| Env             | Zorunlu mu | Açıklama                                      |
|-----------------|------------|-----------------------------------------------|
| `X_USERNAME`    | Evet       | X kullanıcı adı                              |
| `X_AUTH_TOKEN`  | Evet       | X `auth_token` cookie değeri                  |
| `X_AUTH_MULTI`  | Hayır      | X `auth_multi` cookie değeri                  |
| `X_CT0`         | Hayır      | CSRF cookie; varsa ekle                       |
| `X_TWID`        | Hayır      | Kullanıcı id cookie; varsa ekle               |
| `X_PASSWORD`    | Hayır      | Password-based login için (npm run login)     |

### Pipeline Tuning (Opsiyonel)

| Env                  | Default | Açıklama                        |
|----------------------|---------|----------------------------------|
| `TWEETS_PER_DAY`     | 13      | Günlük tweet sayısı             |
| `DISPATCH_START_HOUR`| 9       | Sabah collect saati (24h)       |
| `MAX_ATTEMPTS`       | 3       | Maks. dispatch deneme sayısı    |
| `PORT`               | 3000    | Health server port              |
| `HEADLESS`           | false   | Browser headless modu           |

## Health & Admin API

Bot built-in HTTP server açar:

```bash
# Public
curl http://localhost:3000/health

# Admin (requires ADMIN_TOKEN)
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/status
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/accounts
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/settings

# Manual triggers (requires ADMIN_TOKEN)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/collect
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/dispatch

# Update settings
curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tweets_per_day": 15}' \
  http://localhost:3000/settings
```

## Çoklu Hesap Desteği

Birden fazla X hesabından tweet atmak için her hesap ayrı cookie set ile tanımlanır. Hesaplar `accounts` tablosunda tutulur, her biri bağımsız queue/control state'e sahiptir.

## Docker / Coolify Deploy

Image, gerçek Google Chrome'u içeriyor (patchright anti-detection için `channel: 'chrome'` kullanıyor). Container `Europe/Istanbul` saat diliminde node-cron orchestrator'ı çalıştırır.

### Persistent storage (zorunlu)

Coolify'da tek persistent storage mount et:

| Konteyner yolu | Ne tutar                                                |
|----------------|---------------------------------------------------------|
| `/data`        | X session, SQLite DB, logs, errors, media               |

Uygulama Docker içinde şu path'leri kullanır:

| Path             | Ne tutar                              |
|------------------|---------------------------------------|
| `/data/user-data`| X session (login sonrası dosyalar)    |
| `/data/app-data` | SQLite DB, logs, errors, media        |

### Coolify adımları

1. **New Resource → Application → Public Repository → Dockerfile**
2. Repo: `https://github.com/beydemirfurkan/tweetly`, Branch: `main`
3. **Persistent Storage**: `/data` path'ini kalıcı storage olarak bağla.
4. **Environment Variables**:
   - `X_USERNAME`, `X_AUTH_TOKEN`, `X_AUTH_MULTI`, `X_CT0`, `X_TWID`
   - `OPENROUTER_API_KEY`
   - `ADMIN_TOKEN`
5. Deploy.

### Lokal Docker test

```bash
cp .env.example .env  # değerleri doldur
docker compose up --build
```

Compose, `tweetbot_state` adlı named volume'u `/data` path'ine bağlar; session ve DB bu volume'da kalıcıdır.
