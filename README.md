# tweetly

GitHub Trending'den AI/coding odaklı repoları çekip OpenRouter ile Türkçe tweet metni üreten ve gün içine yarım saatlik aralıklarla X'e (Twitter) yayınlayan otomasyon botu.

## Akış

1. Her gün **09:00** — `collect`: GitHub Trending scrape → dedup → 10 repo için Türkçe tweet üret → `data/queue.json`'a yaz, slot'ları 09:30'dan itibaren 30 dk arayla planla.
2. Her **5 dakika** — `dispatch`: vakti gelen 1 tweeti X'e atar, `data/posted.json`'a kaydeder.

## Kurulum

```bash
npm install
npx patchright install chromium
cp .env.example .env  # değerleri doldur
npm run login         # X session'ını user-data/'ya yazar (bir kez)
```

## Komutlar

```bash
npm start          # Long-running orchestrator — derlenmiş dist'ten (prod)
npm run dev        # Long-running orchestrator — tsx ile (lokal)
npm run collect    # Manuel: trending çek + tweet üret + queue (tsx)
npm run dispatch   # Manuel: vakti gelen 1 tweeti at (tsx)
npm run login      # X session aç (tsx)
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

Bkz. `.env.example`. Kritik: `X_USERNAME`, `X_PASSWORD`, `OPENROUTER_API_KEY`.
Default model: `google/gemini-2.5-flash`.

## Docker / Coolify Deploy

Image, gerçek Google Chrome'u içeriyor (patchright anti-detection için
`channel: 'chrome'` kullanıyor). Container `Europe/Istanbul` saat diliminde
node-cron orchestrator'ı çalıştırır.

### Persistent volumes (zorunlu)

| Konteyner yolu     | Ne tutar                              |
|--------------------|---------------------------------------|
| `/app/user-data`   | X session (login sonrası dosyalar)    |
| `/app/data`        | `posted.json`, `queue.json`, `errors/`|

Bu volume'lar olmadan her deploy'da session kaybolur.

### İlk session yükleme (kritik)

Sunucuda GUI yok; X login akışını **kendi PC'nde bir kez** yap:

```bash
npm install
npx patchright install chromium  # lokal'de, sadece login için
npm run login                    # tarayıcı açılır, e-posta kodu vs. manuel girilir
```

Oluşan `user-data/` klasörünü Coolify'daki `/app/user-data` volume'üne yükle:
- Coolify "Storage" panelinden tar.gz upload, **veya**
- SSH ile sunucuya `scp -r user-data/ user@host:/path/to/volume/`

X session yenilenince (oturum süresi dolarsa) bu adımı tekrarla.

### Coolify adımları

1. **New Resource → Application → Public Repository → Dockerfile**
2. Repo: `https://github.com/beydemirfurkan/tweetly`, Branch: `main`
3. **Persistent Storage**: yukarıdaki iki yolu volume olarak bağla.
4. **Environment Variables**:
   - `X_USERNAME`, `X_PASSWORD`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL` (opsiyonel, default `google/gemini-2.5-flash`)
   - `TWEETS_PER_DAY`, `DISPATCH_START_HOUR`, `DISPATCH_INTERVAL_MIN` (opsiyonel)
5. Deploy.
6. Logları izle: ilk dispatch tick'inde "Vakti gelen tweet yok." normal — `09:00` collect tetiklenince queue dolar, `09:30`'dan itibaren tweet atılır.

### Lokal Docker test

```bash
cp .env.example .env  # değerleri doldur
docker compose up --build
```

`./user-data` ve `./data` host bind mount edilir; lokal session kullanılır.
