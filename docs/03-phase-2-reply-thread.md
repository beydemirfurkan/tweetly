# Faz 2: Reply ve Thread Yayinlama

## Sure
2-3 gun

## Hedefler
- Ana tweet sonrasi reply atabilmek
- Mini thread olarak ardisik tweet atabilmek
- Tweet URL/id'sini yakalamak
- Linki ana tweet yerine reply'a tasimak

## Gorevler

### 2.1 Tweet ID/URL Yakalama
**Dosya:** `src/core/postTweet.ts`

Mevcut `postTweet` fonksiyonu tweet atildiktan sonra sadece `true` donuyor.

Degisiklik:
- Tweet atildiktan sonra sayfanin URL'sinden tweet ID'sini cikarmak
- Tweet URL'sini olusturmak: `https://x.com/<username>/status/<tweetId>`
- `postTweet` fonksiyonunun return tipini degistirmek

```ts
export interface PostResult {
  tweetId: string;
  tweetUrl: string;
}

export async function postTweet(text: string): Promise<PostResult>
```

Tweet ID cikarma yontemleri:
1. Post sonrasi sayfa URL'sini kontrol et (toast tiklandiginda)
2. Sayfa URL'sindeki `/status/<id>` pattern'ini yakala
3. Fallback: tweet text'inin gorunurlugunu dogrula

### 2.2 Reply Atma Fonksiyonu
**Dosya:** `src/core/postTweet.ts`

Yeni fonksiyon: `postReply(parentTweetUrl: string, text: string): Promise<PostResult>`

Is akisi:
1. Parent tweet URL'sine git
2. Reply composer'ı bul ve tikla
3. Metni yaz (typeHuman ile)
4. Reply butonuna tikla
5. Tweet ID/URL yakala

Dikkat:
- Reply composer selector'u: `[data-testid="tweetTextarea_0"]` parent tweet sayfasinda
- Reply butonu: `[data-testid="tweetButtonInline"]`
- Parent tweet sayfasinin yuklenmesini bekle

### 2.3 Thread (Ardisik Tweet) Fonksiyonu
**Dosya:** `src/core/postTweet.ts`

Yeni fonksiyon: `postThread continuation(parentTweetUrl: string, text: string): Promise<PostResult>`

Thread icin:
1. Parent tweet sayfasina git
2. "Add another tweet" veya reply composer'ı kullan
3. Thread devam tweet'i olarak gonder

Alternatif: Kendi tweet'imize reply olarak thread devam ettir.

### 2.4 Dispatch Pipeline Guncelleme
**Dosya:** `src/pipeline/dispatch.ts`

Mevcut akis:
```
dueNext() -> postTweet(text) -> update status
```

Yeni akis:
```
dueNext() -> postTweet(text) -> save tweetId/tweetUrl
         -> if format needs link_reply: postReply(tweetUrl, linkText)
         -> if threadGroupId: postReply(tweetUrl, nextThreadTweet)
         -> update status with all metadata
```

### 2.5 Link Reply Stratejisi
**Dosya:** `src/pipeline/collect.ts`

`no_link_hook`, `question`, `comparison`, `hot_take` formatlari icin:
- Ana tweet link icermeyecek
- Collect asamasinda hem ana tweet hem reply tweet metni uretilecek
- Reply tweet metni: `repo: <url>` veya `kaynak: <url>` formatinda
- Iki QueueItem olusturulacak, ikincisi `parentId` ile birincisine bagli

### 2.6 Thread Dispatch Mantigi
**Dosya:** `src/pipeline/dispatch.ts`

Thread group icin:
1. Ilk tweet atilir, tweetId kaydedilir
2. Ikinci tweet reply olarak atilir (kisa bekleme: 5-10 saniye)
3. Ucuncu tweet reply olarak atilir (kisa bekleme: 5-10 saniye)
4. Hepsinin durumu guncellenir

Thread grup icin dispatch atomik olmali:
- Ilk tweet basarili, ikinci basarisiz -> ikinci retry edilir
- Ilk tweet basarisiz -> tum grup dead

### 2.7 Queue'da Reply/Thread Item Yonetimi
**Dosya:** `src/storage/queue.ts`

- `parentId` olan item'lar parent gonderilmeden dispatch edilmez
- `threadGroupId` olan item'lar sira ile gonderilir
- `dueNext()` fonksiyonu guncellenmeli: parent'i gonderilmemis reply'lari atlama

## Kabul Kriterleri
- [ ] postTweet PostResult donuyor (tweetId, tweetUrl)
- [ ] postReply fonksiyonu calisiyor
- [ ] Thread continuation calisiyor
- [ ] Link reply ana tweetten 2-6 dk sonra atiliyor
- [ ] Thread tweetleri ardisik atiliyor (5-10 dk aralikla)
- [ ] Parent gonderilmeden reply dispatch edilmiyor
- [ ] QueueItem tweetId/tweetUrl/parentId alanlari doluyor
- [ ] Mevcut duz tweet akisi bozulmuyor

## Riskler
- Reply atma selector'leri degisebilir
- Thread continuation X UI farkli calisabilir
- Tweet ID yakalama guvenilir olmayabilir
- Arka arkaya reply atma rate limit'e takilabilir

## Bagimliliklar
- Faz 0 tamamlanmali
- Faz 1 tamamlanmali (format ve metadata hazir olmali)

## Notlar
- Reply ve thread gonderimi arasinda minumum 5-10 saniye bekleme olmali
- Rate limit riski icin reply'lar arasi 30-60 saniye de denenebilir
- Ilk versiyonda link reply 2-6 dk jitter ile planlanacak
- Thread tweetleri ayni dispatch cycle'inda degil, ayri scheduledAt ile gonderilebilir
