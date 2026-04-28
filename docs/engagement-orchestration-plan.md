# Engagement Orchestration Planı

## Durum

Tweetly şu an sadece tweet **atıyor**. Hiçbir etkileşim (like, retweet, bookmark, quote) yapmıyor. Hesabın gerçek bir kullanıcı gibi davranması ve organik etkileşimleri arttırması için otonom bir engagement sistemi gerekiyor.

## Hedef

Hesabı tamamen kendi kendine yönetebilen, doğal görünen, ban riski minimum olan bir engagement sistemi kurmak.

---

## Mimari

```
Tweet atıldı (mevcut collect-tweets workflow)
       │
       ▼
┌──────────────────────────────────────────┐
│         Engagement Orchestrator          │
│                                         │
│  1. Post-Action Hook                    │
│     Tweet atılınca → bookmark + like    │
│                                         │
│  2. Timeline Discovery                  │
│     Günde 2-3 kez timeline tara         │
│     → ilgili tweetleri bul              │
│     → like/retweet schedule et          │
│                                         │
│  3. Daily Budget Manager                │
│     Günlük limitleri takip et           │
│     Aktif saatler içinde yay            │
│     Random delay ile doğal görün        │
└──────────────────────────────────────────┘
       │
       ▼
  ActionEnqueueService (mevcut)
       │
       ▼
  ClaimWorker → Executor (mevcut)
```

---

## Faz 3a: Post-Action Engagement Hook

### Ne yapar

Kendi tweet'imiz atıldıktan sonra otomatik olarak:

- Kendi tweet'imizi bookmark'la
- Kaynak tweet'i like'la (trendshift.io tweet'i vs.)
- (opsiyonel) Kaynak tweet'i retweet'le

### Akış

```
post_actions → status='succeeded'
       │
       ▼
PostActionHook.onPostSucceeded(action)
       │
       ├─► enqueueBookmark(ownTweetUrl)    delay: 2-8 dk
       ├─► enqueueLike(sourceTweetUrl)     delay: 5-15 dk
       └─► enqueueRetweet(sourceTweetUrl)  delay: 10-30 dk (opsiyonel)
```

### Tetikleme mekanizması

- `ClaimWorker.dispatch()` içinde `status='succeeded'` olduktan sonra hook çağrılır
- Mevcut event system yok → doğrudan metod çağrısı ile başlayacağız
- İleride `@nestjs/event-emitter` ile loosely coupled yapılabilir

### Idempotency

- `post_actions.metadata`'ya `engagement_scheduled: true` yazılır
- Hook sadece bu flag yoksa çalışır → tekrar işlememesi için

### Yeni dosyalar

- `src/engagement/engagement.module.ts`
- `src/engagement/post-action-hook.service.ts`

### DB değişikliği

Yok — mevcut `metadata` JSONB alanı kullanılır.

### Tahmini süre

2-3 saat

---

## Faz 3b: Engagement Strategy Config

### Ne yapar

Hesap bazlı yapılandırma — hangi aksiyonlar, ne sıklıkla, hangi saatlerde aktif.

### Yeni migration

```sql
CREATE TABLE engagement_config (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id),
  enabled     BOOLEAN DEFAULT true,

  -- Günlük limitler
  max_likes_per_day      INT DEFAULT 15,
  max_retweets_per_day   INT DEFAULT 5,
  max_quotes_per_day     INT DEFAULT 2,
  max_bookmarks_per_day  INT DEFAULT 8,

  -- Aktif saatler (0-23, Istanbul saati)
  active_hour_start  INT DEFAULT 9,
  active_hour_end    INT DEFAULT 23,

  -- Post-action hook ayarları
  bookmark_own_tweet   BOOLEAN DEFAULT true,
  like_source_tweet    BOOLEAN DEFAULT true,
  retweet_source_tweet BOOLEAN DEFAULT false,

  -- Timeline discovery
  timeline_scrape_enabled  BOOLEAN DEFAULT false,
  timeline_scrape_interval_hours INT DEFAULT 4,

  -- Timing
  min_delay_sec  INT DEFAULT 180,   -- aksiyonlar arası min 3 dk
  max_delay_sec  INT DEFAULT 1800,  -- aksiyonlar arası max 30 dk

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Engagement Counter (günlük takip)

Günlük aksiyon sayılarını takip etmek için iki seçenek:

**Seçenek A: Aggregate sorgu (kolay, DB yükü az)**
```sql
-- Her seferinde hesapla
SELECT COUNT(*) FROM like_actions
WHERE account_id = 'test-account'
  AND status = 'succeeded'
  AND result_at >= CURRENT_DATE;
```

**Seçenek B: Counter tablosu (hızlı sorgu, daha kompleks)**
```sql
CREATE TABLE engagement_counters (
  account_id  TEXT NOT NULL,
  action_type TEXT NOT NULL,
  date        DATE NOT NULL,
  count       INT DEFAULT 0,
  PRIMARY KEY (account_id, action_type, date)
);
```

Seçenek A ile başlayıp performans sorunu olursa B'ye geçeriz.

### Yeni dosyalar

- `src/engagement/engagement-config.service.ts`
- `src/engagement/engagement-counter.service.ts`

### Tahmini süre

2-3 saat

---

## Faz 3c: Timeline Discovery

### Ne yapar

Tarayıcı ile home timeline'ı tarar, ilgili tweetleri bulur, engagement planı yapar.

### Akış

```
TimelineScraper (günde 2-3 kez, aktif saatlerde)
       │
       ▼
1. Home timeline'ı aç → scroll → tweet URL'lerini topla (20-30 adet)
       │
       ▼
2. ContentRelevance (LLM) → her tweet'e ilgi skoru ver (0-1)
       │
       ▼
3. Yüksek skorlulara engagement planla:
   - score > 0.7 → like (40% olasılıkla)
   - score > 0.8 → retweet (15% olasılıkla)
   - score > 0.9 → quote (5% olasılıkla, LLM ile yorum üret)
       │
       ▼
4. Günlük bütçeyi kontrol et, schedule et
```

### Yeni dosyalar

- `src/engagement/timeline-scraper.service.ts` (browser flow)
- `src/engagement/content-relevance.service.ts` (LLM scoring)
- `src/engagement/discovered-tweets.repository.ts`

### Yeni migration

```sql
CREATE TABLE discovered_tweets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      TEXT NOT NULL,
  tweet_url       TEXT NOT NULL,
  author_handle   TEXT,
  content_text    TEXT,
  relevance_score FLOAT,
  engagement_type TEXT,          -- like / retweet / quote / null
  engaged_at      TIMESTAMPTZ,
  discovered_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, tweet_url)
);
```

### Tahmini süre

4-6 saat

---

## Faz 3d: Otonom Döngü (Self-Sustaining Loop)

### Ne yapar

Hesabı tamamen kendi kendine yönetir.

### Günlük döngü

```
09:00  Günlük plan oluştur (tweet + engagement bütçesi)
       │
09-12  Sabah aktivitesi
       - Tweet at
       - 1-2 like
       - 1 bookmark
       │
12-14  Öğle aktivitesi
       - Timeline tara
       - 2-3 like
       - 1 retweet
       │
14-18  Öğleden sonra
       - Tweet at
       - Aralıklı engagement
       │
18-21  Akşam pik
       - Tweet at
       - Timeline tara
       - 3-4 like
       - 1 retweet veya quote
       │
21-23  Sessizleşme
       - Son 1-2 engagement
       │
23:00  Dur
```

### Haftalık ayarlar

- Pazartesi-Cuma: Normal aktivite
- Cumartesi: %50 azaltılmış aktivite
- Pazar: %30 azaltılmış aktivite

### Performans takibi

- Hangi engagement'lar new follower kazandırdı
- Hangi tweet formatları daha çok etkileşim aldı
- Adaptive strategy: iyi çalışanları artır, kötü çalışanları azalt

### Tahmini süre

3-4 saat

---

## Ban Riski Azaltma

| Kural | Uygulama | Parametre |
|---|---|---|
| Günlük limitler | Like max 15-20, Retweet max 5-8, Quote max 2-3 | `engagement_config` |
| Random delay | Her aksiyon arası 3-30 dk | `min_delay_sec`, `max_delay_sec` |
| Aktif saatler | 09:00-23:00 dışında hiçbir şey yapma | `active_hour_start/end` |
| Doğal dağılım | Aksiyonları güne yay, hepsini bir anda yapma | Schedule builder |
| İçerik filtreleme | Sadece alakalı tweetlere engagement yap | LLM scoring |
| Warmup | İlk hafta düşük limitlerle başla, kademeli artır | Manuel config |
| Session davranışı | Tarayıcıda scroll, bekle — anında click yapma | Browser flow |

### X Rate Limit Referansı (browser-based, resmi değil, gözlem)

| Aksiyon | Güvenli günlük limit | Riskli sınır |
|---|---|---|
| Like | 15-25 | 50+ |
| Retweet | 5-10 | 25+ |
| Quote | 1-3 | 10+ |
| Bookmark | 5-10 | 20+ |
| Reply | 2-5 | 15+ |
| Follow | 5-10 | 50+ |

---

## Uygulama Sırası

| Sıra | Faz | Tahmini süre | Değer |
|---|---|---|---|
| 1 | **3a: Post-Action Hook** | 2-3 saat | Anında değer — her tweet sonrası otomatik engagement |
| 2 | **3b: Strategy Config + Counter** | 2-3 saat | Limit yönetimi, hesap bazlı ayar |
| 3 | **3c: Timeline Discovery** | 4-6 saat | Hesabı gerçek bir kullanıcı gibi yapıyor |
| 4 | **3d: Otonom döngü** | 3-4 saat | Tam otonomi |
| **Toplam** | | **11-16 saat** | |

---

## Mevcut Altyapı (yeniden kullanılacak)

- `ActionEnqueueService`: enqueueLike, enqueueBookmark, enqueueRetweet, enqueueQuote hazır
- `ClaimWorker`: otomatik claim → dispatch → result işleme hazır
- `PatchrightLikeExecutor`, `PatchrightRetweetExecutor` vb.: browser-based execution hazır
- `post_actions.metadata`: repo, repoUrl, format, source bilgileri mevcut
- `SettingsService`: dinamik konfigürasyon sistemi mevcut
- `OpenRouterService`: LLM çağrısı için hazır

## Açık Sorular

- [ ] Reply otonom olarak yapılacak mı? (LLM ile yorum üretmek riskli olabilir — yanlış ton, yanlış context)
- [ ] Follow-back yapılacak mı? (bizi takip edenleri takip etme)
- [ ] Quote için yorumlar LLM ile mi üretilecek, hazır template'ler mi kullanılacak?
- [ ] Warmup stratejisi: İlk hafta limitler ne olmalı?
- [ ] Timeline'da hangi içerikleri filtreleyeceğiz? (sadece tech/programming mi, yoksa daha geniş mi?)
