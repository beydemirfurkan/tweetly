# Faz 5: Monetizasyon

## Sure
2-3 gun

## Hedefler
- Sponsorlu icerik destegi
- Affiliate link destegi
- Campaign/uye yonetimi
- Mini urun fikirleri icin altyapi

## On Kosul
Bu faz, Faz 3 (Analytics) tamamlanmali ve en az 2 haftalik veri toplandiktan sonra baslanmali.
Hangi formatin calistigini bilmeden sponsor/affiliate eklemek riskli.

## Gorevler

### 5.1 Campaign Modeli
**Dosya:** `src/types/index.ts`

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

### 5.2 Campaign Storage
**Dosya:** `src/storage/campaigns.ts`

Yeni dosya. `data/campaigns.json` dosyasini yonetir.

Fonksiyonlar:
- `load()` - tum kampanyalari yukle
- `save(state)` - kaydet
- `add(campaign)` - kampanya ekle
- `update(id, patch)` - guncelle
- `getActive()` - aktif kampanyalari getir
- `incrementPosts(id)` - gonderi sayisini artir
- `isExpired(id)` - suresi dolmus mu

### 5.3 Sponsor Format Promptu
**Dosya:** `src/ai/prompts.ts`

Sponsor icerik icin ek prompt kurallari:
- Urun aciklamasi sponsor'un brief'inden alinir
- Dogal dil kullanilir, "reklam" hissi verilmez
- Disclosure zorunlu: "sponsorlu" veya "is birligi"
- Benzer repolarla kiyaslama yapilabilir
- Kullaniciya fayda odakli yazilir

### 5.4 Collect Pipeline Campaign Entegrasyonu
**Dosya:** `src/pipeline/collect.ts`

- Gunluk icerik mix'inde en fazla 1 sponsor slot'u
- Aktif campaign varsa, uygun topic ve format ile eslestir
- Campaign post'u normal siraya dahil edilir
- Sponsor tweet uretimi icin farkli prompt kullanilir

### 5.5 Affiliate Link Yonetimi
**Dosya:** `src/content/campaignLinks.ts`

Yeni dosya. Link donusum ve takip yapisi.

```ts
interface CampaignLink {
  originalUrl: string;
  campaignUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}
```

Fonksiyonlar:
- `buildCampaignLink(url, campaignId)` - UTM parametreli link olustur
- `buildAffiliateLink(url, affiliateCode)` - Affiliate link olustur
- `shouldDisclose(campaign)` - Disclosure gerekli mi

Ornek cikti:
```
https://example.com/product?utm_source=tweetly&utm_medium=social&utm_campaign=sponsor-001
```

### 5.6 Disclosure Yonetimi
**Dosya:** `src/content/campaignLinks.ts`

Her sponsor tweet'e disclosure eklenmeli:
- Tweet metninin sonunda: "(sponsorlu)" veya "(is birligi)"
- Veya ayri bir reply'da: "Bu tweet [sponsor] ile is birligi icinde hazirlanmistir."
- X'in sponsorlu icerik politikalarina uygunluk

### 5.7 Campaign Health Endpoint
**Dosya:** `src/ops/healthServer.ts`

`/status` endpoint'ine campaign bilgisi ekle:
- Aktif kampanya sayisi
- Toplam gonderi
- Kalan gonderi

## Kabul Kriterleri
- [ ] Campaign modeli tanimli
- [ ] Campaign storage calisiyor
- [ ] Sponsor format promptu hazir
- [ ] Collect pipeline campaign slot'u kullaniyor
- [ ] Affiliate link olusturma calisiyor
- [ ] Disclosure mekanizmasi calisiyor
- [ ] Health endpoint campaign bilgisi gosteriyor
- [ ] `npm run build` hata vermiyor

## Riskler
- Erken sponsor icerik takipci guvenini zedeleyebilir
- Affiliate linkler X tarafinda spam olarak isaretlenebilir
- Disclosure eksikligi hukuki risk olusturabilir
- Sponsor brief'i kalitesizse tweet kalitesi duser

## Bagimliliklar
- Faz 0 tamamlanmali
- Faz 1 tamamlanmali
- Faz 2 tamamlanmali
- Faz 3 tamamlanmali (en az 2 haftalik veri)
- Faz 4 onerilir ama zorunlu degil

## Notlar
- Ilk sponsor icerigi manuel onay ile gonder
- Affiliate linkler icin X'in link politikalarini kontrol et
- Disclosure her zaman tweet'in bir parçasi olmali
- Sponsor icerik orani gunluk toplam tweet'in %15'ini gecmemeli
- Campaign JSON dosyasi `.gitignore`'a eklenmeli

## Monetizasyon Stratejisi Ozeti

### Kisa Vade (1-3 ay)
| Kanal | Beklenen Gelir | Efor |
|-------|----------------|------|
| Affiliate linkler | Dusuk | Az |
| Ilk sponsor tweet | Orta | Orta |

### Orta Vade (3-6 ay)
| Kanal | Beklenen Gelir | Efor |
|-------|----------------|------|
| Duzenli sponsor paketleri | Orta-Yuksek | Orta |
| Newsletter baslatma | Dusuk-Orta | Yuksek |

### Uzun Vade (6+ ay)
| Kanal | Beklenen Gelir | Efor |
|-------|----------------|------|
| Mini urun (rapor, rehber) | Orta | Orta |
| Danismanlik lead | Yuksek | Dusuk |
| Topluluk (Discord/Telegram) | Dolayli | Yuksek |
