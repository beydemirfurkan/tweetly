# Faz 3: Analytics ve Raporlama

## Sure
1-2 gun

## Hedefler
- Hangi format ne kadar etkilesim aldigini bilmek
- Haftalik performans raporu uretmek
- Para kazanma kararlarini veriye dayali yapmak

## Gorevler

### 3.1 PostedItem Genisletme
**Dosya:** `src/types/index.ts`, `src/storage/posted.ts`

Mevcut PostedItem:
```ts
interface PostedItem {
  repo: string;
  postedAt: string;
}
```

Hedef:
```ts
interface PostedItem {
  repo: string;
  postedAt: string;
  format: ContentFormat;
  objective: EngagementObjective;
  topic: string;
  textHash: string;
  tweetId?: string;
  tweetUrl?: string;
  campaignId?: string;
}
```

### 3.2 Analytics Storage
**Dosya:** `src/storage/analytics.ts`

Yeni dosya. `data/analytics.json` dosyasini yonetir.

```ts
interface AnalyticsEvent {
  id: string;
  timestamp: string;
  type: 'post_success' | 'post_failure' | 'reply_success' | 'thread_complete';
  format: ContentFormat;
  objective: EngagementObjective;
  repo: string;
  topic: string;
  source: string;
  tweetId?: string;
  tweetUrl?: string;
  duration: number;
}

interface DailyStats {
  date: string;
  postsByFormat: Record<ContentFormat, number>;
  postsByObjective: Record<EngagementObjective, number>;
  postsByTopic: Record<string, number>;
  postsBySource: Record<string, number>;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  topRepos: string[];
}
```

Fonksiyonlar:
- `recordEvent(event)` - olay kaydet
- `getDailyStats(date)` - gunluk istatistik
- `getWeeklyStats(weekStart)` - haftalik istatistik
- `getFormatPerformance()` - format bazli performans
- `cleanup(olderThanDays)` - eski kayitlari temizle

### 3.3 Dispatch'a Analytics Entegrasyonu
**Dosya:** `src/pipeline/dispatch.ts`

Her basarili/basarisiz gonderimde analytics event kaydet:
- Post oncesi timestamp
- Post sonrasi timestamp
- Duration hesapla
- Format, objective, topic bilgilerini kaydet

### 3.4 Haftalik Rapor Uretici
**Dosya:** `src/ops/report.ts`

Yeni dosya. Haftalik rapor uretir.

Rapor icerigi:
```
== Haftalik Tweetly Raporu ==
Donem: 2026-04-21 - 2026-04-27

Genel:
- Toplam post: 42
- Basarili: 38 (90.5%)
- Basarisiz: 4

Format Bazli:
| Format        | Post | Basarili |
|---------------|------|----------|
| no_link_hook  | 12   | 12       |
| link_reply    | 10   | 9        |
| question      | 5    | 5        |
| comparison    | 5    | 5        |
| mini_thread   | 3    | 3        |
| repo_drop     | 4    | 2        |
| bookmark_bait | 3    | 2        |

Topic Bazli:
| Topic         | Post |
|---------------|------|
| ai-agents     | 15   |
| dev-tools     | 12   |
| coding-assist | 8    |
| infra         | 4    |
| other         | 3    |

En Cok Paylasilan Repolar:
1. openai/codex (3 tweet)
2. browser-use/browser-use (2 tweet)
...

Notlar:
- Question format reply orani yuksek mi? (manuel kontrol gerekli)
- Mini thread'ler bookmark aldi mi? (manuel kontrol gerekli)
```

### 3.5 Rapor Komutu
**Dosya:** `package.json`

Yeni script:
```json
"report": "tsx src/ops/report.ts"
```

Kullanim:
```bash
npm run report           # son 7 gun
npm run report -- 14     # son 14 gun
```

### 3.6 Health Endpoint'e Analytics Ekleme
**Dosya:** `src/ops/healthServer.ts`

`/health` ve `/status` endpoint'lerine analytics ozet bilgisi ekle:
- Son 7 gun toplam post
- En basarili format
- En basarisiz format
- Son hata

### 3.7 Ticari Skor Formulu
**Dosya:** `src/ops/report.ts`

```ts
function commercialScore(stats: FormatStats): number {
  return (
    stats.profileClicks * 4 +
    stats.bookmarks * 3 +
    stats.replies * 3 +
    stats.retweets * 2 +
    stats.likes * 1 +
    stats.linkClicks * 5 -
    stats.negativeFeedback * 10
  );
}
```

Not: Ilk etapta bu metrikler X API olmadan olcmuyor. Ama formul hazir olmali.
Manuel veri girisi icin `data/manual-analytics.json` dosyasi kullanilabilir.

## Kabul Kriterleri
- [ ] Analytics storage calisiyor
- [ ] Her post sonrasi event kaydediliyor
- [ ] Haftalik rapor uretiliyor
- [ ] `npm run report` komutu calisiyor
- [ ] Health endpoint analytics ozeti donuyor
- [ ] Ticari skor formulu tanimli
- [ ] Eski PostedItem verileri geriye uyumlu okunuyor

## Riskler
- Analytics JSON buyukse performans etkilenebilir
- Manuel veri girisi surecli olabilir
- X API erisimi olmadan gercek etkilesim metrikleri alinamiyor

## Bagimliliklar
- Faz 0 tamamlanmali
- Faz 1 tamamlanmali (format/objective metadata)
- Faz 2 tamamlanmali (tweetId/tweetUrl)

## Notlar
- Ilk etapta sadece post metadata kaydedilir
- Gercek etkilesim metrikleri (impression, like, reply sayisi) X API gerekir
- X API entegrasyonu ayri bir gorev olarak planlanmali
- Manuel analytics import icin CSV/JSON format desteği eklenebilir
