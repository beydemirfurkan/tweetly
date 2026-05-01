# Faz 1: Format Motoru

## Sure
2-3 gun

## Hedefler
- Icerik formatlarini tanimlamak ve yonetmek
- Her format icin ozel prompt uretmek
- Gunluk icerik mix'ini otomatik secmek
- Link ana tweet yerine reply'da verilebilir hale getirmek (ama posting henuz Faz 2'de)

## Gorevler

### 1.1 ContentFormat Tipi
**Dosya:** `src/types/index.ts`

```ts
export type ContentFormat =
  | 'repo_drop'
  | 'no_link_hook'
  | 'question'
  | 'comparison'
  | 'mini_thread'
  | 'bookmark_bait'
  | 'hot_take'
  | 'weekly_digest'
  | 'sponsor_native';

export type EngagementObjective =
  | 'reply'
  | 'bookmark'
  | 'profile_click'
  | 'retweet'
  | 'link_click'
  | 'dwell';
```

### 1.2 Format Promptlari
**Dosya:** `src/ai/prompts.ts`

Her format icin ayri prompt sablonu olusturulacak:

| Format | Prompt Yaklasimi | Hedef |
|--------|-----------------|-------|
| repo_drop | Kisa teknik aciklama, link etiketiyle | Fayda |
| no_link_hook | Problem/gozlem, link yok | Reach |
| question | Kullanicinin fikrini soran yapi | Reply |
| comparison | X yerine neden Y tartismasi | Reply/retweet |
| mini_thread | 3 tweetlik sorun-cozum-senaryo | Dwell |
| bookmark_bait | Liste veya derleme formati | Bookmark |
| hot_take | Yumusak gorus belirtme | Reply |
| weekly_digest | Haftanin onemli repolari | Bookmark/retweet |
| sponsor_native | Sponsor uyumlu dogal dil | Click |

Her prompt ayni kurallara uymali:
- Maksimum 280 karakter (URL dahil)
- Emoji yok, hashtag yok
- Teknik terimler Ingilizce kalir
- Pazarlama dili yok

### 1.3 Format Secim Stratejisi
**Dosya:** `src/content/strategy.ts`

Gunluk icerik mix'i orani:

| Format | Gunluk Oran | Aciklama |
|--------|------------|----------|
| no_link_hook | 2 | Sabah/aksam reach |
| link_reply | 2 | Kaynak verme |
| question | 1 | Reply tetikleme |
| comparison | 1 | Tartisma baslatma |
| repo_drop | 1 | Klasik tanitim |
| mini_thread | 1 (3 tweet) | Derinlemesine icerik |
| bookmark_bait | 1 | Liste/derleme |
| hot_take | 1 | Gorus |

Haftanin belirli gunlerinde:
- Pazartesi: weekly_digest yerine normal mix
- Cuma: weekly_digest (haftanin onemli 7 reposu)

### 1.4 QueueItem Metadata Genisletme
**Dosya:** `src/types/index.ts`, `src/storage/queue.ts`

QueueItem'a eklenecekler:
```ts
format: ContentFormat;
objective: EngagementObjective;
topic: string;
source: string;
score: number;
parentId?: string;
threadGroupId?: string;
```

EnqueueInput da ayni sekilde genisletilecek.

### 1.5 Collect Pipeline Guncelleme
**Dosya:** `src/pipeline/collect.ts`

- `buildSchedule` fonksiyonu gunluk mix'i hesaplayacak
- Her repo icin en uygun format secilecek
- Format secimi repo ozelliklerine gore yapilacak:
  - Aciklamada soru isareti varsa -> `question` aday
  - Benzer repolar daha once paylasildiysa -> `comparison` aday
  - Cok yildizli, populer repo -> `no_link_hook` aday
  - Demo/docs linki tespit edildiyse -> `bookmark_bait` aday

### 1.6 Mini Thread Destegi
**Dosya:** `src/types/index.ts`

```ts
export interface ThreadGroup {
  id: string;
  repo: string;
  tweets: ThreadTweet[];
}

export interface ThreadTweet {
  position: number;
  text: string;
  format: ContentFormat;
}
```

Thread icin 3 ayri QueueItem olusturulacak, ayni `threadGroupId` ile baglantili.

## Kabul Kriterleri
- [ ] ContentFormat ve EngagementObjective tipleri tanimli
- [ ] Her format icin prompt sablonu hazir
- [ ] Gunluk format mix'i stratejisi kodda tanimli
- [ ] QueueItem format/objective/topic/source/score alanlari ekli
- [ ] Collect pipeline format secimi yapiyor
- [ ] Thread group olusturma calisiyor
- [ ] `npm run build` hata vermiyor
- [ ] Mevcut duz tweet formati hala calisiyor (geriye uyumluluk)

## Riskler
- Format secimi yanlis olursa etkilesim dusebilir
- Thread uretimi prompt kalitesine bagli
- QueueItem genislemesi mevcut JSON dosyalarini bozmamali

## Bagimliliklar
- Faz 0 tamamlanmali

## Notlar
- Bu fazda sadece uretim degisiyor, yayinlama (dispatch/postTweet) degismiyor
- Reply/Thread yayinlama Faz 2'de yapilacak
- Geriye uyumluluk kritik: mevcut duz tweet formati calismaya devam etmeli
