# X Algoritma Analizi (twitter/the-algorithm)

## Kaynak
GitHub: https://github.com/twitter/the-algorithm
Yerel analiz: `docs/the-algorithm-local/the-algorithm-main/`
Analiz tarihi: 2026-04-27
Validasyon durumu: Kaynak kod ile dogrulandı

## Mimari Ozet

X'in For You Timeline sistemi 4 ana asamadan olusur:

```
Candidate Generation -> Feature Hydration -> Ranking -> Filtering & Mixing
```

### 1. Candidate Generation (Aday Uretme)
1 milyar tweetten bir kac bine daraltma.

| Kaynak | Aciklama | Oran |
|--------|----------|------|
| Search Index (Earlybird) | Takip edilenlerin tweetleri | ~50% |
| UTEG | "X liked this" - takip edilenlerin begendikleri | Out-of-network |
| Tweet Mixer | Dis kaynakli tweet adaylari | Out-of-network |
| FRS | Follow Recommendation Service | Yeni hesap onerileri |

### 2. Feature Hydration (Ozellik Doldurma)
Her aday tweet icin ~6000 feature hesaplanir. Tweetler icin Grok annotation'lar da dahil:
- `GrokSlopScoreFeature` — Dusuk kaliteli icerik skoru (1=dusuk, 2=orta, 3=yuksek)
- `GrokIsSpamFeature`, `GrokIsNsfwFeature`, `GrokIsLowQualityFeature` — Kalite filtreleri
- `GrokPoliticalInclinationFeature` — Sadece metrik tracking icin, skorlamayı etkilemiyor
- `GrokSunnyScoreFeature` — Pozitif icerik skoru

### 3. Heavy Ranking
MaskNet tabanli ML modeli. Her tweet icin 10 farkli etkilesim olasiligi tahmin eder.

### 4. HeuristicScorer — Post-ML Rescoring Pipeline (KAYNAK KODDAN DOGRULANDI)

`HeuristicScorer.scala` — ML skorunu alan ve 16 farkli rescorer'in carpanlarini birbirine carpip uygulayan merkezi mekanizma.

**Rescoring siralamasi:**

| # | Rescorer | Aciklama | Varsayilan Deger |
|---|----------|----------|------------------|
| 1 | `RescoreOutOfNetwork` | Takip edilmeyen hesabin tweeti | **0.75** |
| 2 | `RescoreReplies` | Reply tweetleri | **0.75** |
| 3 | `RescoreMTLNormalization` | Multi-task learning kalibrasyonu | Alpha/Beta/Gamma params |
| 4 | `ContentExplorationListwise` | Yeni icerik kesfi | Runtime |
| 5 | `DeepRetrievalListwise` | Derin erisim icerikleri | Runtime |
| 6 | `EvergreenDeepRetrieval` | Kalici populer icerik | Runtime |
| 7 | `EvergreenDeepRetrievalCrossBorder` | Uluslararasi kalici icerik | Runtime |
| 8 | `AuthorBasedListwise` | **Yazar cesitliligi** | Decay=0.5, Floor=0.25 |
| 9 | `ImpressedAuthorDecay` | **Gosterim bazli yazar azalma** | In/Out network ayri |
| 10 | `ImpressedMediaCluster` | Medya kumesi cesitliligi | Runtime |
| 11 | `ImpressedImageCluster` | Gorsel kumesi cesitliligi | Runtime |
| 12 | `CandidateSourceDiversity` | Aday kaynagi cesitliligi | Runtime |
| 13 | `GrokSlopScoreRescorer` | **Grok dusuk kalite cezasi** | decay=1.0 (kapali) |
| 14 | `RescoreFeedbackFatigue` | "Daha az goster" gecmisi | Dinamik |
| 15 | `MultimodalEmbedding` | Cok modlu embedding | gamma=0.0 (kapali) |
| 16 | `RescoreLiveContent` | Canli yayin boost | Kapali (1M+ takipci sart) |
| + | `ControlAiRescorer` (x2) | "Daha fazla/az goster" ayarlari | Runtime |

**Formul:** `finalScore = mlScore * product(allRescorerFactors)`

**Kritik:** Her rescorer carpani birbirine carpilir. Ornegin hem OON hem reply olan bir tweet: `0.75 * 0.75 = 0.5625`

## Heavy Ranker Agirliklari

| Etkilesim | Agirlik | Dogrulama Durumu |
|-----------|---------|------------------|
| reply_engaged_by_author | 75.0 | Kaynak kodda default=0.0, degerler Feature Server'dan geliyor |
| reply | 13.5 | Ayni sekilde runtime |
| good_profile_click | 12.0 | Ayni sekilde runtime |
| good_click | 11.0 | Ayni sekilde runtime |
| good_click_v2 | 10.0 | Ayni sekilde runtime |
| retweet | 1.0 | Ayni sekilde runtime |
| fav | 0.5 | Ayni sekilde runtime |
| video_playback50 | 0.005 | Ayni sekilde runtime |
| negative_feedback_v2 | -74.0 | Ayni sekilde runtime |
| report | -369.0 | Ayni sekilde runtime |

**Skor formulu:** `score = sum(weight_i * probability_i)`

### Onemli Not: Agirliklar Runtime'da Belirleniyor

`HomeGlobalParams.scala` dosyasinda tum model agirliklari `default = 0.0` olarak tanimlanmis. Yukaridaki tablodaki degerler X'in 2023 blog yazisindan alinmis REFERANS degerlerdir. Gercek uretim degerleri Feature Server (FS) uzerinden dinamik olarak yuklenir ve degistirilebilir.

**Tweetly icin anlam:** Agirliklar degisebilir ama reply'in en guclu pozitif sinyal, report'un en guclu negatif sinyal oldugu yatagi muhtemelen degismedi.

## Author Diversity — Detayli Analiz (KAYNAK KODDAN DOGRULANDI)

### ImpressedAuthorDecayRescoringProvider

**Dosya:** `home-mixer/.../scorer/ImpressedAuthorDecayRescoringProvider.scala`

Formul: `factor = (1 - floor) * decay^index + floor`

In-Network ve Out-of-Network icin ayri parametreler:
- `AuthorDiversityInNetworkDecayFactor` / `AuthorDiversityOutNetworkDecayFactor`
- `AuthorDiversityInNetworkFloor` / `AuthorDiversityOutNetworkFloor`

**Ornek (Decay=0.5, Floor=0.25):**
| Pozisyon | Carpan | Aciklama |
|----------|--------|----------|
| 0 | 1.00 | Ilk tweet (tam skor) |
| 1 | 0.625 | 2. tweet |
| 2 | 0.4375 | 3. tweet |
| 3+ | -> 0.25 | Floor'a yakinsar |

**Ek:** Kullanicinin daha once gordugu (impressed) ayni yazarin tweetleri pozisyon hesabina dahil edilir. Yani gunde 6+ tweet atarsan, 6. tweet'in skor coktan floor'a vurmus olur.

### DiversityDiscountProvider

**Dosya:** `home-mixer/.../scorer/DiversityDiscountProvider.scala`

Genel amacli diversity discount: `Decay=0.5`, `Floor=0.25`

## RescoreReplies ve RescoreOutOfNetwork (KAYNAK KODDAN DOGRULANDI)

**Dosya:** `home-mixer/.../param/ScoredTweetsParam.scala`

```
OutOfNetworkScaleFactorParam: default = 0.75
ReplyScaleFactorParam:        default = 0.75
```

**Dosya:** `home-mixer/.../scorer/RescoringFactorProvider.scala`

- `RescoreOutOfNetwork`: `!candidate.features.getOrElse(InNetworkFeature, false)` → takip edilmeyen hesabin tweeti 0.75 ile carpar
- `RescoreReplies`: `candidate.features.getOrElse(InReplyToTweetIdFeature, None).isDefined` → reply tweeti 0.75 ile carpar

**Tweetly icin anlam:**
- Tweetly kendi takipcilerine in-network tweet atiyor → OON penalty uygulanmaz
- Tweetly'nin reply'lari 0.75 ile carpilir ama bu ANCAK ML skorlamadan SONRAki rescorer'da olur
- Reply'in kendisi ML modelde 75.0 agirlikla en guclu sinyal — rescorer penalty'si ML boost'unu dengelemek icin var
- Net etki: reply hala en guclu etkilesim turu

## GrokSlop — AI Kalite Filtrasyonu (KAYNAK KODDAN DOGRULANDI)

**Dosya:** `home-mixer/.../scorer/GrokSlopScoreRescorer.scala`

- `GrokSlopScoreDecayValueParam`: default = 1.0 (0.0-1.0 arasi)
- Sadece `slopScore == 3` (yuksek) olan tweetlere uygulanir
- Default 1.0 oldugu icin **production'da kapali**
- Etkinlestirilirse: `factor = decayValue` (ornegin 0.5 ise skorun yarisi)

**Dosya:** `home-mixer/.../feature_hydrator/GrokAnnotationsFeatureHydrator.scala`

Grok her tweet icin su annotation'lari uretiyor:
- `slopScore` (1=dusuk, 2=orta, 3=yuksek)
- `isNsfw`, `isGore`, `isViolent`, `isSpam`, `isLowQuality`, `isOcr`
- `sunnyScore` — Pozitif icerik skoru
- `politicalInclination` — Sadece metrik, skorlamayı etkilemiyor
- Kategori skorlari ve etiketler

**Tweetly icin anlam:** Grok AI tweetleri analiz ediyor. Dusuk kaliteli, spam, tekrar icerik isaretlenme riski var.

## ControlAi — Kullanici Kontrollu Algoritma (KAYNAK KODDAN DOGRULANDI)

**Dosya:** `home-mixer/.../scorer/ControlAiRescorer.scala`

Kullanicilar "Daha fazla goster" / "Daha az goster" diyebilir:
- `ControlAiShowMoreScaleFactorParam` — Boost carpani
- `ControlAiShowLessScaleFactorParam` — Cezalandirma carpani
- Topic embedding benzerligiyle eslestirme yapilir

**Tweetly icin anlam:** Takipcilerin tweetly tweetlerini "Daha fazla goster" demesi guclu boost saglar.

## LowSignalScorer (KAYNAK KODDAN DOGRULANDI)

**Dosya:** `home-mixer/.../scorer/LowSignalScorer.scala`

Dusuk sinyalli (az etkilesimli) kullanicilar icin alternatif skorlama:
- Aday kaynagi pozisyonuna gore skor verir
- Ayni yazardan tekrarlari kaldirir (`deduplicateAuthors`)
- In-network siralamasina gore puanlama

**Dosya:** `tweet-mixer/.../gate/AllowLowSignalUserGate.scala`

Dusuk sinyalli kullanici: Az takip edilen, az etkilesim yapan hesap. Bu kullanicilar icin farkli candidate generation stratejisi kullanilir.

## FeedbackFatigue (KAYNAK KODDAN DOGRULANDI)

**Dosya:** `home-mixer/.../scorer/RescoringFactorProvider.scala` (RescoreFeedbackFatigue)

"SeeFewer" geri bildirim gecmisi:
- Son 30 gun icindeki "Daha az goster" kayitleri incelenir
- 4 tur: Tweet, Like, Follow, Retweet geri bildirimleri
- Ilgili yazarlara, begenenlere, takipcilere, retweet edenlere discount uygulanir

**Tweetly icin anlam:** Ayni tur icerigi tekrarlamak "Daha az goster" riskini artirir → snowball efektiyle skor dususu.

## Visibility Filtering

**Dosya:** `visibilitylib/src/main/scala/com/twitter/visibility/features/Features.scala`

Icerik filtreleme motorunun feature'lari:
- `AuthorReportsViewerAsSpam` / `ViewerReportsAuthorAsSpam` — Spam raporlama
- `ViewerHasUniversalQualityFilterEnabled` — Evrensel kalite filtresi
- `TweetSafetyLabels` — Guvenlik etiketleri (spam, nsfw, abusive)
- `AuthorIsVerified` / `AuthorIsBlueVerified` — Dogrulama durumu
- Block, mute, protected account kontrolleri

**Tweetly icin anlam:** Blue Verified hesap bazi filtreleri asabilir. Spam etiketlenmesi gorunurlugu dogrudan dusurur.

## Candidate Sinyalleri

| Sinyal | Kullanim |
|--------|----------|
| Author Follow | Aday havuzuna giris |
| Tweet Favorite | Ranking ve aday secimi |
| Retweet | Ranking ve aday secimi |
| Tweet Reply | Ranking ve aday secimi (EN GUCLU) |
| Tweet Bookmark | Ranking |
| Tweet Click | Ranking |
| Tweet Share | Ranking |
| Video Watch | Ranking |
| Notification Open | Aday secimi |
| Tweet Don't Like | Negative signal |
| Author Mute/Block | Negative signal |

## SimClusters

Topluluk tabanli embedding sistemi:
- ~145.000 topluluk tespit edildi
- Her kullanici "InterestedIn" vektoru ile temsil edilir
- Her tweet favorite'ler araciligiyla embedding alir
- Ayni topluluktaki kullanicilar benzer icerikler gorur

**Tweetly icin anlam:** Hesap AI/dev tools toplulugunda tutarli kalmali.

## RealGraph

Kullanici-author arasi etkilesim olasiligi tahmini:
- Favorite, retweet, follow, profile view, DM, mention, tweet click, dwell time
- Exponentially weighted moving average (EWMA) ile zamanla azalan agirlik

**Tweetly icin anlam:** Takipcilerle reply/like iliskisi olusturmak RealGraph skorunu artirir.

## UTEG (User Tweet Entity Graph)

"X liked this" mekanizmasi:
- Takip edilenlerin son 24-48 saatteki etkilesimlerini izler
- Collaborative filtering ile oneri uretir

**Tweetly icin anlam:** Ilk 30 dakikada takipci etkilesimi kritik.

## HeuristicScorer — Tam Pipeline Ozeti

```
mlScore (Heavy Ranker)
  * OutOfNetworkScaleFactor (0.75 default)
  * ReplyScaleFactor (0.75 default)
  * MTLCalibration
  * ContentExploration
  * DeepRetrieval
  * EvergreenDeepRetrieval
  * EvergreenCrossBorder
  * AuthorDiversity (exponential decay, floor 0.25)
  * ImpressedAuthorDecay (impression-aware)
  * MediaClusterDiversity
  * ImageClusterDiversity
  * CandidateSourceDiversity
  * GrokSlopDecay (default 1.0 = kapali)
  * FeedbackFatigue (dinamik)
  * MultimodalEmbedding (default 0.0 = kapali)
  * LiveContent (kapali)
  * ControlAi (kullanici tercihleri)
= finalScore
```

Eger skor `Epsilon` degerinden kucukse ve `noNegHeuristic` aktifse, rescorer uygulanmaz.

## Tweetly'e Doğrudan Uygulanan Dersler

### Yapilmasi Gerekenler
1. **Reply odakli formatlar** — En guclu sinyal reply_engaged_by_author (75.0). Soru soran, tartisma baslatan formatlar.
2. **Profile click CTA** — good_profile_click 12.0 agirlikla 3. en guclu sinyal. Bio'ya link, aciklama eklemek.
3. **Dwell odakli icerik** — good_click_v2 (2 dk dwell = 10.0). Thread, derinlemesine aciklama.
4. **Konu tutarliligi** — SimClusters icin AI/dev tools disina cikmamak.
5. **Format cesitliligi** — Author diversity + feedback fatigue'ye karsi farkli formatlar.
6. **Ilk 30 dk kritik** — UTEG icin takipci etkilesimi. Posting time optimization.
7. **Link reply'a** — Ana tweet link icermez, link reply'da. Link penalty riskini azaltir.
8. **Gunde 6-8 post** — Author diversity decay: 6. tweet ~0.25 floor'a vuruyor. Daha fazlasi israfa donusur.
9. **Blue Verified** — Bazi visibility filtrelerini asar, guven sinyali verir.

### Yapilmamasi Gerekenler
1. **Ana tweet'te link** — Link feature'u ranking'i etkileyebilir, reply'a konmali
2. **Tek tip icerik** — Feedback fatigue + GrokSlop riski
3. **Spam benzeri tekrar** — Report (-369.0) en agir ceza. "Daha az goster" snowball efekti
4. **Abartili dil** — Clickbait detection + Grok isLowQuality riski
5. **Cok sik post** — Author diversity: 6+ tweet/gun floor'a vurur
6. **Ayni konuyu sik tekrar** — FeedbackFatigue: 30 gun icindeki "SeeFewer" kayitleri takip eder

## Validasyon Notlari

### Kaynak Kodda Dogrulanan Bulgular
- [x] `OutOfNetworkScaleFactor default = 0.75` — `ScoredTweetsParam.scala:464`
- [x] `ReplyScaleFactor default = 0.75` — `ScoredTweetsParam.scala:471`
- [x] `GrokSlopScoreDecayValue default = 1.0` (kapali) — `ScoredTweetsParam.scala:778`
- [x] `GrokSlopScoreRescorer` sadece score=3'e uygulanir — `GrokSlopScoreRescorer.scala`
- [x] `AuthorDiversityBasedRescorer` formul: `(1-floor)*decay^index+floor` — `ImpressedAuthorDecayRescoringProvider.scala`
- [x] `DiversityDiscountProvider Decay=0.5, Floor=0.25` — `DiversityDiscountProvider.scala`
- [x] `HeuristicScorer` 16+ rescorer'in carpimi — `HeuristicScorer.scala`
- [x] `RescoreReplies` selector: `InReplyToTweetIdFeature.isDefined` — `RescoringFactorProvider.scala`
- [x] `ControlAiRescorer` topic embedding benzerligiyle calisir — `ControlAiRescorer.scala`
- [x] `LowSignalScorer` author deduplication yapar — `LowSignalScorer.scala`
- [x] `FeedbackFatigue` 30 gunluk "SeeFewer" gecmisi — `RescoringFactorProvider.scala`
- [x] Grok annotation feature'lari (slop, spam, nsfw, sunny, political) — `GrokAnnotationsFeatureHydrator.scala`
- [x] `PoliticalInclination` sadece metrik, skorlamayı etkilemiyor — `GrokAnnotationsFeatureHydrator.scala:118`
- [x] Tum model agirliklari `default = 0.0` — Feature Server'dan geliyor — `HomeGlobalParams.scala`

### Blog/Docs'tan Alinan (Dogrulanamayan)
- [ ] Heavy ranker agirliklari (75.0, 13.5, vb.) — Runtime degerler, 2023 blog referans
- [ ] ~145.000 SimClusters toplulugu — Dokumantasyon referans
- [ ] ~6000 feature — Dokumantasyon referans

## Uyarilar

- Bu analiz 2023 acik kaynak surumune dayaniyor, local zip muhtemelen daha guncel bir commit
- Model agirliklari Feature Server'dan runtime'da geliyor, kodda default=0.0
- Rescorer default degerleri (0.75, 0.5, vb.) gercek production degerleri olabilir (FSBoundedParam min/max icinde)
- Algoritma surekli evrimlesiyor
- Oneriler deneysel, sonuclari olcmek sart
