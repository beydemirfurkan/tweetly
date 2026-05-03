# Faz 4: Scoring ve Kaynak Kalitesi

## Sure
2-3 gun

## Hedefler
- Her repo icin kalite skoru hesaplamak
- Dusuk kaliteli repolari elemek
- Topic tagging yapmak
- Kaynaklari genisletmek icin altyapi hazirlamak

## Gorevler

### 4.1 Repo Scoring Sistemi
**Dosya:** `src/content/scoring.ts`

Yeni dosya. Her TrendingRepo icin kalite skoru hesaplar.

```ts
interface RepoScore {
  repo: string;
  total: number;
  breakdown: ScoreBreakdown;
}

interface ScoreBreakdown {
  relevance: number;    // AI/dev alakasi
  popularity: number;   // Yildiz trendi
  trust: number;        // Toplam yildiz, kurumsal mu
  clarity: number;      // Aciklama kalitesi
  freshness: number;    // Yeni mi, guncelleme var mi
  novelty: number;      // Daha once benzer konu islendi mi
  penalty: number;      // Ceza puanlari (negatif)
}
```

Skorlama kurallari:

| Sinyal | Puan | Mantik |
|--------|------|--------|
| Aciklamada `agent`, `ai`, `llm`, `coding`, `developer`, `workflow` | +20 | Ilgi alani uyumu |
| Aciklamada `library`, `framework`, `tool`, `cli` | +10 | Arac tipi |
| BugunYildiz > 100 | +25 | Yuksek trend |
| BugunYildiz 50-100 | +15 | Orta trend |
| BugunYildiz 10-50 | +5 | Dusuk trend |
| ToplamYildiz > 10000 | +15 | Guvenilir |
| ToplamYildiz 1000-10000 | +10 | Kabul edilebilir |
| Aciklama net ve kisa (10-100 karakter) | +10 | Iyi aciklama |
| Aciklama yok | -20 | Bilgi eksik |
| Cok generic (sadece "A library for X") | -10 | Yetersiz |
| Daha once benzer konu 3+ kez islendi | -15 | Tekrar |
| Owner kurumsal (google, meta, openai, microsoft) | +5 | Guven |
| README'de demo/docs linki tespit | +10 | Kalite |
| Sponsor/affiliate uyumu var | +10 | Monetizasyon |

Minimum kalite esigi: `score >= 40`

### 4.2 Topic Tagging
**Dosya:** `src/content/topics.ts`

Yeni dosya. Repo'yu topic kategorisine(sine) atar.

Topic agaci:
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

Eslestirme mantigi:
- Aciklama + dil + owner bilgilerinden keyword matching
- LLM ile topic onerisi (opsiyonel, sonraki iterasyon)

Ornekler:
- `openai/codex` -> `ai-coding`, `ai-agents`
- `vercel/next.js` -> `frontend`, `dev-infra`
- `langchain/langchain` -> `ai-agents`, `ai-coding`
- `tailwindlabs/tailwindcss` -> `frontend`, `dev-tools`

### 4.3 Collect Pipeline Scoring Entegrasyonu
**Dosya:** `src/pipeline/collect.ts`

Degisiklik:
1. Trending repolari al
2. Her repo icin score hesapla
3. Score'esigi altindakileri ele
4. Kalan repolari score'a gore sirala (yuksekten dusuge)
5. Topic'leri ata
6. Format seciminde topic ve score'u kullan

### 4.4 Yenilik Kontrolu
**Dosya:** `src/content/scoring.ts`

Content memory ile entegrasyon:
- Son 30 gunde ayni topic'te kac tweet atildi
- Ayni topic 5+ kez islendiyse novelty puanini duset
- Ayni owner 3+ kez paylasildiysa penalty uygula

### 4.5 Kaynak Genisletme Altyapisi
**Dosya:** `src/sources/`

Yeni kaynaklar icin interface tanimla:

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

Mevcut `fetchTrending` bu interface'e uyumlu hale getirilir.

Gelecek kaynaklar (ayri gorevler):
- `src/sources/hackerNews.ts`
- `src/sources/productHunt.ts`
- `src/sources/papersWithCode.ts`

Bu fazda sadece interface ve mevcut kaynagin uyumu yapilir.

### 4.6 Scoring Test Senaryoları
**Dosya:** `src/content/scoring.ts`

Test icin ornek repolar ve beklenen skorlar:

| Repo | Beklenen Skor | Aciklama |
|------|---------------|----------|
| openai/codex | 80+ | Yuksek trend, AI coding, guvenilir |
| piccolo-orm/piccolo | 40-60 | Orta trend, dev tool |
| (generic lib) | <40 | Aciklama yetersiz, dusuk trend |

## Kabul Kriterleri
- [ ] Repo scoring sistemi calisiyor
- [ ] Dusuk skorlu repolar eleniyor
- [ ] Topic tagging calisiyor
- [ ] Collect pipeline score ve topic kullaniyor
- [ ] Yenilik kontrolu content memory ile entegre
- [ ] ContentSource interface tanimli
- [ ] Mevcut GitHub Trending kaynagi interface'e uyumlu
- [ ] `npm run build` hata vermiyor

## Riskler
- Skorlama kurallari yanlis olursa kaliteli repolar elenebilir
- Topic tagging keyword matching ile sinirli kalabilir
- Yenilik kontrolu cok agresif olursa icerik cesitliligi azalir

## Bagimliliklar
- Faz 0 tamamlanmali
- Faz 1 tamamlanmali (format/topic metadata)
- Faz 3 tamamlanmali (analytics ile performans takibi)

## Notlar
- Skorlama kurallari ilk etapta hard-coded
- LLM bazli scoring ileride eklenebilir
- Yeni kaynak eklemek Faz 4 kapsaminda degil, sonrasi icin planlanmali
- Skorlama agirliklari deneylerle ayarlanmali
