# tweetly

GitHub Trending'den AI/coding odaklı repoları çekip OpenRouter ile Türkçe tweet metni üreten ve gün içine 30 dakikalık aralıklarla X'e (Twitter) yayınlayan otomasyon botu.

## Akış

1. Her gün **09:00** — `collect`: GitHub Trending scrape → dedup → 10 repo için Türkçe tweet üret → `data/queue.json`'a yaz, slot'ları 09:30'dan itibaren 30 dk arayla planla.
2. Her **5 dakika** — `dispatch`: vakti gelen 1 tweeti X'e atar, `data/posted.json`'a kaydeder.
3. Queue'da gönderilecek tweet kalmazsa orchestrator otomatik refill yapar; boş/başarısız refill sonrası 30 dk cooldown uygular.

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
npm run import-session # X cookie'lerini browser profiline import et (tsx)
npm run tweet -- "metin"   # Tek seferlik manuel tweet (tsx)
```

## Yapı

Proje TypeScript (CommonJS, target ES2022). Lokal'de `tsx`, prod'da derlenmiş `dist/` çalışır.

```
src/
  core/        browser, login, postTweet (Playwright/patchright)
  sources/     githubTrending.ts (cheerio scrape)
  ai/          openrouter.ts + prompts.ts
  pipeline/    collect.ts, dispatch.ts
  storage/     posted.ts, queue.ts (atomic JSON)
  config/      env validation + sabitler
  types/       domain tipleri
  utils/       logger (console + data/logs/YYYY-MM-DD.log)
  index.ts     node-cron orchestrator
data/
  posted.json, queue.json
  logs/        günlük rotated log dosyaları
  errors/      hata anı tarayıcı screenshot'ları
```

## Build

```bash
npm run build   # tsc → dist/
npm start       # node dist/index.js (Coolify/prod entry)
```

## Env

Bkz. `.env.example`. Kritik: `OPENROUTER_API_KEY` ve X session için `X_AUTH_TOKEN`.
Default model: `google/gemini-2.5-flash`.

## Health

Bot built-in HTTP server açar:

```bash
curl http://localhost:3000/health
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/status
```

`/health` temel queue/runtime bilgisini döner. `/status` detaylı path/config özetini döner ve `ADMIN_TOKEN` ister.

## Docker / Coolify Deploy

Image, gerçek Google Chrome'u içeriyor (patchright anti-detection için
`channel: 'chrome'` kullanıyor). Container `Europe/Istanbul` saat diliminde
node-cron orchestrator'ı çalıştırır.

### Persistent storage (zorunlu)

Coolify'da tek persistent storage mount et:

| Konteyner yolu | Ne tutar                                                |
|----------------|---------------------------------------------------------|
| `/data`        | X session, `posted.json`, `queue.json`, logs, errors    |

Uygulama Docker içinde şu path'leri kullanır:

| Path             | Ne tutar                              |
|------------------|---------------------------------------|
| `/data/user-data`| X session (login sonrası dosyalar)    |
| `/data/app-data` | `posted.json`, `queue.json`, `errors/`|

Bu storage olmadan her deploy'da session ve queue kaybolur.

### X session yönetimi (kritik)

Önerilen yöntem: kendi tarayıcında login olmuş X cookie'lerini Coolify env'e ekle. App her startup'ta bu cookie'leri `/data/user-data` browser profiline otomatik import eder.

| Env             | Zorunlu mu | Açıklama                                      |
|-----------------|------------|-----------------------------------------------|
| `X_AUTH_TOKEN`  | Evet       | X `auth_token` cookie değeri                  |
| `X_AUTH_MULTI`  | Hayır      | X `auth_multi` cookie değeri                  |
| `X_CT0`         | Hayır      | CSRF cookie; varsa ekle                       |
| `X_TWID`        | Hayır      | Kullanıcı id cookie; varsa ekle               |

Bu değerler secret'tır; repoya commit edilmez, sadece `.env` veya Coolify env içinde tutulur. Session yenilenirse cookie değerlerini güncelle ve redeploy/restart et.

Fallback yöntem: lokal profili oluşturup `/data/user-data` içine taşımak için `npm run import-session` çalıştır, sonra `user-data/` klasörünü storage'a kopyala.

### Coolify adımları

1. **New Resource → Application → Public Repository → Dockerfile**
2. Repo: `https://github.com/beydemirfurkan/tweetly`, Branch: `main`
3. **Persistent Storage**: `/data` path'ini kalıcı storage olarak bağla.
4. **Environment Variables**:
   - `X_AUTH_TOKEN`
   - `OPENROUTER_API_KEY`
   - `ADMIN_TOKEN`
5. Deploy.
6. Logları izle: ilk dispatch tick'inde "Vakti gelen tweet yok." normal — `09:00` collect tetiklenince queue dolar, `09:30`'dan itibaren 30 dk aralıkla tweet atılır.

### Lokal Docker test

```bash
cp .env.example .env  # değerleri doldur
docker compose up --build
```

Compose, `tweetbot_state` adlı named volume'u `/data` path'ine bağlar; session ve queue bu volume'da kalıcıdır.
