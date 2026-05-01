# Veri Modelleri

## Mevcut Modeller

### TrendingRepo
**Dosya:** `src/types/index.ts`

```ts
interface TrendingRepo {
  owner: string;
  name: string;
  slug: string;
  url: string;
  description: string;
  language: string;
  starsToday: number;
  totalStars: number;
}
```

Degisiklik yok.

### QueueItem
**Dosya:** `src/types/index.ts`

Mevcut:
```ts
interface QueueItem {
  id: string;
  status: QueueStatus;
  attempts: number;
  createdAt: string;
  scheduledAt: string;
  repo: string;
  url: string;
  text: string;
  sentAt?: string;
  lastError?: string;
  lastTriedAt?: string;
}
```

### PostedItem
**Dosya:** `src/types/index.ts`

Mevcut:
```ts
interface PostedItem {
  repo: string;
  postedAt: string;
}
```

## Yeni Modeller

### ContentFormat (Faz 1)
```ts
type ContentFormat =
  | 'repo_drop'
  | 'no_link_hook'
  | 'question'
  | 'comparison'
  | 'mini_thread'
  | 'bookmark_bait'
  | 'hot_take'
  | 'weekly_digest'
  | 'sponsor_native';
```

### EngagementObjective (Faz 1)
```ts
type EngagementObjective =
  | 'reply'
  | 'bookmark'
  | 'profile_click'
  | 'retweet'
  | 'link_click'
  | 'dwell';
```

### Topic (Faz 4)
```ts
type Topic =
  | 'ai-agents'
  | 'ai-coding'
  | 'ai-models'
  | 'dev-tools'
  | 'dev-infra'
  | 'frontend'
  | 'backend'
  | 'data'
  | 'security'
  | 'open-source'
  | 'other';
```

### QueueItem (Genisletilmis - Faz 1+)
```ts
interface QueueItem {
  id: string;
  status: QueueStatus;
  attempts: number;
  createdAt: string;
  scheduledAt: string;
  repo: string;
  url: string;
  text: string;
  format: ContentFormat;
  objective: EngagementObjective;
  topic: Topic;
  source: string;
  score: number;
  parentId?: string;
  threadGroupId?: string;
  tweetId?: string;
  tweetUrl?: string;
  sentAt?: string;
  lastError?: string;
  lastTriedAt?: string;
  campaignId?: string;
}
```

### PostedItem (Genisletilmis - Faz 3)
```ts
interface PostedItem {
  repo: string;
  postedAt: string;
  format: ContentFormat;
  objective: EngagementObjective;
  topic: Topic;
  textHash: string;
  tweetId?: string;
  tweetUrl?: string;
  campaignId?: string;
}
```

### PostResult (Faz 2)
```ts
interface PostResult {
  tweetId: string;
  tweetUrl: string;
}
```

### ThreadGroup (Faz 1)
```ts
interface ThreadGroup {
  id: string;
  repo: string;
  tweets: ThreadTweet[];
}

interface ThreadTweet {
  position: number;
  text: string;
  format: ContentFormat;
}
```

### RepoScore (Faz 4)
```ts
interface RepoScore {
  repo: string;
  total: number;
  breakdown: ScoreBreakdown;
}

interface ScoreBreakdown {
  relevance: number;
  popularity: number;
  trust: number;
  clarity: number;
  freshness: number;
  novelty: number;
  penalty: number;
}
```

### AnalyticsEvent (Faz 3)
```ts
interface AnalyticsEvent {
  id: string;
  timestamp: string;
  type: 'post_success' | 'post_failure' | 'reply_success' | 'thread_complete';
  format: ContentFormat;
  objective: EngagementObjective;
  repo: string;
  topic: Topic;
  source: string;
  tweetId?: string;
  tweetUrl?: string;
  duration: number;
}
```

### DailyStats (Faz 3)
```ts
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

### Campaign (Faz 5)
```ts
interface Campaign {
  id: string;
  sponsorName: string;
  productUrl: string;
  campaignUrl: string;
  affiliateCode?: string;
  disclosure: string;
  startsAt: string;
  endsAt: string;
  maxPosts: number;
  postsSent: number;
  targetTopics: Topic[];
  targetFormats: ContentFormat[];
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAt: string;
}
```

### ContentSource (Faz 4)
```ts
interface ContentSource {
  name: string;
  fetch(): Promise<SourcedItem[]>;
}

interface SourcedItem {
  title: string;
  url: string;
  description: string;
  source: string;
  score?: number;
  topic?: Topic;
  publishedAt?: string;
}
```

### CampaignLink (Faz 5)
```ts
interface CampaignLink {
  originalUrl: string;
  campaignUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}
```

## Geriye Uyumluluk

### QueueState
Mevcut `queue.json` dosyalari yeni alanlar olmadan da calismalidir.

Strateji:
- Yeni alanlar opsiyonel olarak tanimlanir (`?` ile)
- `load()` fonksiyonu eksik alanlar icin default deger verir
- `dueNext()` fonksiyonu `format` alani yoksa `'repo_drop'` varsayar

### PostedState
Mevcut `posted.json` dosyalari yeni alanlar olmadan da calismalidir.

Strateji:
- Yeni alanlar opsiyonel olarak tanimlanir
- `load()` fonksiyonu eksik alanlar icin default deger verir
- Raporlama eksik alanlari `unknown` olarak gosterebilir

## JSON Dosyalari

| Dosya | Faz | Aciklama |
|-------|-----|----------|
| `data/queue.json` | Mevcut | Tweet kuyrugu |
| `data/posted.json` | Mevcut | Gonderilen tweetler |
| `data/control.json` | Mevcut | Circuit breaker durumu |
| `data/content-memory.json` | Mevcut | Icerik tekrar kontrolu |
| `data/analytics.json` | Faz 3 | Analytics olaylari |
| `data/campaigns.json` | Faz 5 | Sponsor kampanyalari |
