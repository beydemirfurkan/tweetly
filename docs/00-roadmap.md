# Tweetly Gelistirme Roadmap'i

## Vizyon

Tweetly'u "repo paylasan bot"tan "Turkce AI/dev tool medya hesabi"na donusturmek.
Amac: X'te etkilesim artirmak, takipci kazanmak ve para kazanmak.

## Mevcut Durum

- Tek kaynak: GitHub Trending
- Tek format: kisa repo aciklamasi + GitHub linki
- Gunde 20 tweet, 30 dk aralikla
- Analytics yok
- Reply/thread destegi yok
- Monetizasyon yok

## Hedef Durum

- Coklu kaynak ve kalite skorlamasi
- 8+ icerik formati, her biri farkli etkilesim hedefi
- Link ana tweet yerine reply'da
- Haftalik performans raporu
- Sponsor/affiliate/mini-urun monetizasyon kanallari

## Fazlar

| Faz | Ad | Sure | Durum |
|-----|----|------|-------|
| 0 | Guvenlik ve Temel | 1 gun | Bekliyor |
| 1 | Format Motoru | 2-3 gun | Bekliyor |
| 2 | Reply ve Thread Yayinlama | 2-3 gun | Bekliyor |
| 3 | Analytics ve Raporlama | 1-2 gun | Bekliyor |
| 4 | Scoring ve Kaynak Kalitesi | 2-3 gun | Bekliyor |
| 5 | Monetizasyon | 2-3 gun | Bekliyor |

## X Algoritma Kararlari (twitter/the-algorithm)

Detayli analiz icin: `06-algorithm-analysis.md`

Onemli cikarimlar:
- Reply ve author-engaged reply en guclu sinyaller (agirlik: 75, 13.5)
- Profile click, dwell, conversation depth odulendirilir (12, 11, 10)
- Negative feedback ve report ciddi hasar verir (-74, -369)
- Tek tip icerik ve yuksek frekans yorulma yaratabilir
- Hasitasi konu kumelerinde tutarlilik (SimClusters) onemli

## Baglantili Dokumanlar

- `01-phase-0-security.md` - Guvenlik ve config temizligi
- `02-phase-1-format-engine.md` - Format motoru
- `03-phase-2-reply-thread.md` - Reply ve thread yayinlama
- `04-phase-3-analytics.md` - Analytics ve raporlama
- `05-phase-4-scoring.md` - Scoring ve kaynak kalitesi
- `06-phase-5-monetization.md` - Monetizasyon
- `07-algorithm-analysis.md` - X algoritma analizi
- `08-content-strategy.md` - Icerik stratejisi
- `09-data-models.md` - Veri modelleri
