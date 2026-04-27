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
npm start         # Long-running orchestrator (cron'lar)
npm run collect   # Manuel: trending çek + tweet üret + queue
npm run dispatch  # Manuel: vakti gelen 1 tweeti at
npm run login     # X session aç
```

## Yapı

```
src/
  core/        browser, login, postTweet (Playwright/patchright)
  sources/     githubTrending.js (cheerio scrape)
  ai/          openrouter.js + prompts.js
  pipeline/    collect.js, dispatch.js
  storage/     posted.js, queue.js (atomic JSON)
  config/      env validation + sabitler
  utils/       logger
  index.js     node-cron orchestrator
scripts/       manuel tetikleyici entry'ler
data/          posted.json, queue.json, errors/
```

## Env

Bkz. `.env.example`. Kritik: `X_USERNAME`, `X_PASSWORD`, `OPENROUTER_API_KEY`.
Default model: `google/gemini-2.5-flash`.
