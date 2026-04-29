# Growth and Safety Roadmap

## Durum

Tweetly tarafinda temel mimari artik daha moduler ve daha olgun durumda. Su an sistemin guclu taraflari sunlar:

- GitHub trending kaynakli icerik toplayabiliyor
- Icerik uretip planli sekilde post queue'suna yazabiliyor
- Action engine ile X uzerinde browser tabanli aksiyon calistirabiliyor
- Basit rastgele gecikmeler ve gun icine yayilmis saat dagilimi kullaniyor
- Timeline discovery ve engagement icin ilk altyapi mevcut

Ancak buyume hedefi icin hala net gelistirme alanlari var:

- Gunluk tweet sayisi hala muhafazakar kaliyor
- Icerik kaynagi fazla tek boyutlu kaliyor
- Uzunluk, ton ve format cesitliligi sinirli
- Hesap davranisi yeterince zengin degil
- Oturum guvenligi ve session sagligi daha sistematik ele alinmali
- Premium hesabin sagladigi rahatlik daha verimli kullanilabilir

Bu dokumanin amaci, bu gelisimleri uygulamaya gecmeden once faz bazli ve detayli sekilde tanimlamak.

## Hedef

Hedefimiz su:

- Hesabin gunluk gorunurlugunu kontrollu sekilde artirmak
- Icerik cesitliligini ve tekrar degerini yukari cekmek
- Hesap davranisini daha dogal, daha az mekanik hale getirmek
- Session ve auth yonetimini daha guvenli hale getirmek
- Premium hesabin avantajini abartiya kacmadan kullanmak

## Temel Ilkeler

Tum fazlarda su prensipler korunacak:

1. Buyume, spam hissi olusturmadan yapilacak.
2. Rate ve davranis degisiklikleri kademeli uygulanacak.
3. Her yeni davranis config ile acilip kapatilabilecek.
4. Mevcut moduler yapi bozulmadan ilerlenilecek.
5. 25.000 karakterlik uzun post davranisi hedeflenmeyecek; dogal gorunen pratik uzunluk bantlari korunacak.
6. Üretilen tweetlerde Türkçe karakterler doğru kullanılacak.
7. Üretilen tweet metni tamamen lowercase olacak.

## Yazım Kuralları

Tweet üretiminde dil kalitesi ayrıca korunacak:

- Türkçe karakterler bozulmayacak: ç, ğ, ı, i, ö, ş, ü doğru kullanılacak.
- ASCII'ye düşmüş yazım kullanılmayacak: `degil`, `guncel`, `cok`, `saglik` gibi formlar elenecek.
- Tüm tweet metni lowercase olacak.
- Cümle başı, repo açıklaması, başlık, özel isim veya teknik terim gerekçesiyle büyük harf kullanılmayacak.
- Teknik terimler Türkçeleştirilmeye zorlanmayacak ama lowercase yazılacak: `ai`, `github`, `typescript`, `react`, `workflow`, `agent`.
- URL gerekiyorsa link metni de lowercase normalizasyonundan geçebilir; içerik kalitesi link casing'e bağlı olmamalı.

## Hedef Davranis Ozeti

Plan sonunda sistemin genel davranisi suya yakin olacak:

- Hafta ici gunde 20-25 tweet
- Hafta sonu daha yuksek ama kontrollu aktivite
- GitHub disinda farkli teknik kaynaklardan icerik
- Kisa, orta, uzun ve mini-thread formatlarinin karisimi
- Gun icinde degisen aktivite bloklari ve sessiz pencereler
- Oturum sagligini kontrol eden ve cookie verisini duzenli tazeleyen altyapi
- Premium hesapla uyumlu ama abartisiz 600-800 karakter bandinda zaman zaman daha detayli paylasimlar

---

## Faz 1: Tweet Frekansi ve Dagitim Stratejisi

### Problem

Su an sistem varsayilan olarak gunde 13 tweet uretiyor. Minimum dispatch araligi ve jitter birlesince paylasimlar genelde 60-90 dakika araligina yayiliyor. Bu ritim cok agresif degil ama buyume hedefi icin nispeten dusuk kaliyor.

### Hedef

Gunluk paylasim kapasitesini hafta ici 20-25 bandina cikarmak, bunu yaparken saat dagilimini daha esnek hale getirmek.

### Onerilen Davranis

- Hafta ici hedef: 20-23 tweet/gun
- Hafta sonu hedef: 24-28 tweet/gun
- Minimum dispatch araligi: 25 dakika
- Jitter araligi: 10-30 dakika
- Efektif ortalama tweet araligi: 35-55 dakika

### Uygulama Kapsami

Asagidaki alanlar gozyden gecirilecek:

- `src/settings/settings.service.ts`
- `src/workflows/collect-tweets.workflow.ts`

### Degisecek Mantik

1. `tweets_per_day` varsayilani yukari alinacak.
2. `dispatch_interval_min`, `schedule_jitter_min`, `schedule_jitter_max` yeniden dengelenecek.
3. Saat agirliklari sadece oglen ve aksam piklerine bagli kalmayacak.
4. Sabah erken ve gece kapanis pencereleri kontrollu sekilde eklenecek.
5. Hafta ici ve hafta sonu icin farkli dagitim profilleri tanimlanacak.

### Onerilen Saat Profili

Hafta ici:

- 07:00-08:59: dusuk
- 09:00-11:59: orta
- 12:00-14:59: yuksek
- 15:00-17:59: orta
- 18:00-21:59: en yuksek
- 22:00-23:00: dusuk-orta

Hafta sonu:

- Baslangic hafta icine gore biraz daha gec olabilir
- Oglen ve aksam bloklari daha guclu tutulur
- Toplam hacim hafta icinden daha yuksek olabilir
- Gece kapanis penceresi kontrollu sekilde biraz uzatilabilir

### Warmup / Ramp-up Stratejisi

Tweet sayisi bir anda 13'ten 25+ seviyesine cikarilmayacak. Daha guvenli gecis icin kademeli artis uygulanacak:

- Hafta 1: hafta ici 15-17, hafta sonu 18-20 tweet/gun
- Hafta 2: hafta ici 18-20, hafta sonu 21-23 tweet/gun
- Hafta 3: hafta ici 20-23, hafta sonu 24-28 tweet/gun

Bu ramp-up sadece frekans icin degil, hata oranini ve session sagligini izlemek icin de gerekli. Auth failure, post failure veya duplicate oranlari artarsa sistem bir onceki guvenli banda geri donmeli.

### Riskler

- Tek seferde cok sert artis yapilirsa hesap davranisi yapay gorunebilir.
- Tweet sayisi artarken format cesitliligi artmazsa tekrar hissi olusabilir.

### Basari Kriterleri

- Hafta ici planlanan schedule 20-25 tweet uretebilmeli
- Hafta sonu otomatik olarak daha yuksek ama kontrollu profile gecebilmeli
- Ayni saate yigilma olmamali
- Minimum aralik kurali her durumda korunmali

### Faz Sonu Notu

Bu faz tek basina yeterli degil. Icerik cesitliligi artmadan sadece frekans artisi uzun vadede kaliteyi dusurebilir.

---

## Faz 2: Icerik Kaynaklarini Genisletme

### Problem

Mevcut akisin ana ekseni GitHub trending. Bu odak degerli ama tek basinadirsa timeline'da tek tip gorunum yaratir.

### Hedef

GitHub odagini koruyup ek teknik kaynaklarla daha zengin bir editoriyal akis kurmak.

### Strateji

Ana icerik omurgasi yine gelisen ve populer yazilim, AI ve arac ekosistemi olacak. Ancak bunu tek kaynak yerine farkli kaynaklardan beslemek gerekiyor.

### Onerilen Kaynak Gruplari

1. GitHub Trending
2. Hacker News
3. Dev.to weekly/top articles
4. Secili teknik gundem kaynaklari
5. Sistem icinde uretilen orijinal yorum formatlari

### Uygulama Kapsami

Yeni veya guncellenecek alanlar:

- `src/trending-source/github-trending.source.ts`
- `src/trending-source/`
- `src/domain/services/repo-scoring.ts`
- `src/domain/services/topic-inference.ts`
- `src/domain/types/content.types.ts`
- `src/content-generation/`

### Onerilen Yeni Bilesenler

- `src/trending-source/hackernews.source.ts`
- `src/trending-source/devto.source.ts`
- `src/trending-source/source-registry.service.ts`

### Kaynak Bazli Kullanim Rolu

GitHub Trending:

- Yukselen repo avciligi
- Yeni araclar
- Open source showcase

Hacker News:

- Gunun teknik gundemi
- Uzerine yorum yazilabilecek haberler
- AI, browser tooling, infra, open source duyurulari

Dev.to:

- Egitici ve pratik icerikler
- Kod kalibi, mimari, arac karsilastirmalari

### Icerik Filtreleme Ilkesi

Her kaynaktan gelen veri ayni sekilde paylasilmayacak. Once su sorularla filtrelenecek:

- Bu konu hesabin cizgisine uyuyor mu?
- Teknik degeri var mi?
- Tartisma veya kaydetme potansiyeli var mi?
- Yeterince yeni veya dikkat cekici mi?

### Riskler

- Fazla genis konu dagilimi hesap kimligini zayiflatabilir.
- Dandik veya yuzeysel kaynaklar kaliteyi dusurebilir.

### Basari Kriterleri

- Sistem farkli kaynaklardan normalize edilmis icerik cikartabilmeli
- Her icerik bir konu etiketiyle siniflanabilmeli
- GitHub disi icerikler de mevcut scoring mantigina entegre olabilmeli
- Kalite skoru dusuk icerikler publish queue'ya girmemeli

### Faz Sonu Notu

Bu fazin amaci odagi bozmak degil, odagi derinlestirmek. Test Account hesabi hala teknoloji ve gelisen araclar ekseninde kalmali.

### Source Quality Scoring

GitHub disi kaynaklar icin repo scoring yeterli degil. Hacker News, Dev.to ve benzeri kaynaklardan gelen icerikler ayri bir kalite skoru ile filtrelenmeli.

Onerilen skor alanlari:

- `source_score`: kaynagin guvenilirligi ve hesaba uygunlugu
- `topic_score`: konunun yazilim, AI, dev tooling veya open source eksenine yakinligi
- `freshness_score`: haberin veya makalenin ne kadar guncel oldugu
- `discussion_score`: yorum, upvote, reaction veya tartisma potansiyeli
- `account_fit_score`: Test Account hesap kimligine uyum

Onerilen karar modeli:

- `total_score >= 70`: publish icin guclu aday
- `total_score 55-69`: sadece uygun format varsa aday
- `total_score < 55`: elenir

Bu model ilk asamada basit kural tabanli olabilir. Ileride son 14 gun performansina gore adaptive hale getirilebilir.

---

## Faz 3: Tweet Format ve Stil Cesitliligi

### Problem

Sistem farkli formatlari desteklese bile genel davranis hala belli bir sabitlige sahip. Uzunluk, ton ve yapi daha cesitli olmali.

### Hedef

Timeline'da ayni hesabin surekli benzer cumle yapilariyla gorunmesini azaltmak ve icerik tiplerine gore daha dogal bir dagilim saglamak.

### Onerilen Format Genislemesi

Mevcut formatlara ek olarak:

- `dev_news`
- `code_tip`
- `poll_tweet`
- `hot_take_indie`
- `retro_repo`

### Uzunluk Profili

Premium hesapta asiriya kacmadan su bantlar hedeflenecek:

Not: 280 karakter artik limit degil; sadece kisa/standart format icin dogal hedef esigi.

- Kisa: 40-80 karakter
- Orta: 120-220 karakter
- Uzun: 220-420 karakter
- Premium detayli: 420-800 karakter
- Mini-thread: 4-7 tweet

### Onemli Sinir

25.000 karakter hedeflenmeyecek. Premium avantajinin kullanim amaci sunlar olacak:

- Bazen tek tweette daha derli toplu analiz yazabilmek
- Thread yapisini biraz uzatabilmek
- Kisa format zorlamasi yuzunden kalitesiz sikistirmayi azaltmak

### Ton Profilleri

Sistem tek bir sabit ton kullanmamali. Oranli bir dagilim hedeflenmeli:

- Bilgilendirici
- Merak uyandiran
- Karsilastirmali
- Kisisel yorumlu
- Tartisma acan
- Hafif ironik ama kontrollu

### Yapisal Cesitlilik

- Tek paragraf
- 2-3 satirlik blok
- Acilis kancasi + detay + kapanis
- Kisa liste yapisi
- Mini-thread girisi

### Uygulama Kapsami

- `src/content-generation/prompt-registry.ts`
- `src/content-generation/openrouter.service.ts`
- `src/workflows/collect-tweets.workflow.ts`
- `src/domain/types/content.types.ts`

### Riskler

- Fazla cesitlilik hesap ses tonunu dagitabilir.
- Uzun icerikler dogru kalite kontrolden gecmezse okunurluk dusurur.

### Basari Kriterleri

- Format secimi istatistiksel olarak daha dengeli olmali
- Ayni format veya benzer acilis cumlesi sik tekrar etmemeli
- Premium uzunluk kullanimlari az ama anlamli olmali

---

## Faz 4: Organik Davranis Simulasyonu

### Problem

Sistem esas olarak post ureten ve sinirli engagement yapan bir akis. Bu durum hesabin sadece tek tur aktivite yapan bir profile benzemesine neden olabilir.

### Hedef

Hesabin gun icindeki davranisini daha organik bir kullanim paternine yaklastirmak.

### Not

Bu fazin amaci platform kurallarini asmak degil. Ama hesap davranisinin asiri mekanik ve tekrarlayan gorunmesini azaltmak gerekiyor.

### Onerilen Davranislar

1. Ana sayfada kontrollu scroll
2. Arama yapip sonuc acma
3. Profil sayfasi ziyareti
4. Tweet detayi acip reply okuma
5. Explore benzeri sayfalarda kisa gezi

### Davranis Kurallari

- Her gun sabit sayida degil, bir bant dahilinde calismali
- Her aktivite aksiyonunun once ve sonra bekleme suresi olmali
- Ayni aksiyon arka arkaya zincir halinde tekrar etmemeli
- Post atilan zamanlarla makul sekilde ayrisabilmeli

### Uygulama Kapsami

Onerilen yeni bilesenler:

- `src/x-automation/browser/x-browsing-simulator.service.ts`
- `src/engagement/organic-behavior-scheduler.service.ts`

Muhtemel entegrasyon noktalar:

- `src/x-automation/browser/x-browser.service.ts`
- `src/x-automation/x-automation.module.ts`
- `src/engagement/`

### Isletim Modeli

- Gunde 4-8 organik oturum
- Her oturum 20 saniye ile 3 dakika arasi degisebilen hafif kullanim
- Her oturum farkli davranis sabloni secmeli

### Riskler

- Browser akisina fazla yeni adim eklemek hata yuzeyini buyutur.
- Asiri davranis simulasyonu islem hacmini gereksiz arttirabilir.

### Basari Kriterleri

- Aktivite gunluk plan icinde daginik sekilde calismali
- Tek tip tarayici davranisi ortaya cikmamali
- Hata durumunda ana post akisina zarar vermemeli

---

## Faz 5: Aktivite Pencereleri ve Gunluk Ritim

### Problem

Mevcut scheduler gun icinde rastgelelik kullaniyor ama daha yuksek dogallik icin gunluk ritim anlayisi eksik.

### Hedef

Her gun ayni gorunen dagilim yerine farkli gunlerde farkli enerji seviyelerine sahip bir aktivite modeli kurmak.

### Onerilen Model

Gun tek parca olarak ele alinmayacak. Bloklar halinde dusunulecek:

- Sabah acilisi
- Oglen ritmi
- Ogleden sonra orta yogunluk
- Aksam piki
- Kapanis penceresi

### Yeni Davranis Kurallari

1. Ilk tweet saati her gun ayni olmamali.
2. Son tweet saati de her gun kaymali.
3. Gun icinde 1-3 sessiz pencere bulunmali.
4. Hafta ici ve hafta sonu ayri profiller olmali.
5. Bazi gunler daha enerjik, bazi gunler daha sakin gecmeli.

### Uygulama Kapsami

- `src/workflows/collect-tweets.workflow.ts`
- `src/settings/settings.service.ts`

### Onerilen Config Alanlari

Yeni config ihtiyaci dogarsa su alanlar dusunulebilir:

- `weekday_tweets_per_day`
- `weekend_tweets_per_day`
- `active_window_start`
- `active_window_end`
- `quiet_window_count`
- `quiet_window_min_minutes`
- `quiet_window_max_minutes`

### Riskler

- Fazla parametre sistemi karmasiklastirabilir.
- Sessiz pencereler schedule builder ile cakisabilir.

### Basari Kriterleri

- Gunluk dagilimlar birbirine birebir benzememeli
- Sessiz pencereler tweet ritmine mantikli sekilde islemeli
- Hafta sonu profili belirgin bicimde daha yuksek hacimli ama kontrollu olmali

---

## Faz 6: Session Guvenligi ve Auth Dayanikliligi

### Problem

Su an bot, X oturumunu cookie injection ile kullaniyor. Bu yontem calisiyor ama session sagligi ve cookie tazelenmesi daha sistematik hale getirilmeli.

### Hedef

Oturumun bozulmasini daha erken fark eden, cookie verisini daha kontrollu saklayan ve auth kaynakli arizalarda daha guvenli davranan bir yapi kurmak.

### Kapsam

Bu faz, kullanici sifresi veya agresif login otomasyonu eklemek icin degil; mevcut cookie tabanli oturumu daha dayanikli yonetmek icin tasarlaniyor.

### Onerilen Iyilestirmeler

1. Session health check
2. Cookie refresh persistence
3. Hesap bazli cookie metadata takibi
4. Auth failure siniflandirmasi
5. Hata sonrasi kontrollu pause davranisi

### Session Health Check

Her browser acilisinda veya belirli periyotlarda su kontroller yapilabilir:

- Login sayfasina dusuluyor mu?
- Profil veya home sayfasi beklendigi gibi aciliyor mu?
- Hesap dogru kullaniciya mi ait?
- `ct0` ve benzeri session cookie'leri guncellenmis mi?

### Cookie Persistence Stratejisi

- Yeni cookie degeri gorulurse DB tarafina yazilabilir
- Cookie guncellemesi yalnizca gerekli alanlarla sinirli olmali
- Plain text saklama modeli ileride sifreleme ile guclendirilebilir

### Onerilen Kod Alanlari

- `src/x-automation/browser/x-browser.service.ts`
- `src/x-automation/browser/x-post-flow.service.ts`
- `src/accounts/accounts.service.ts`
- `src/domain/ports/session-provider.port.ts`

Onerilen yeni servis:

- `src/x-automation/browser/session-health-checker.service.ts`

### Guvenlik Sertlestirme Basliklari

- Auth cookie alanlarinin daha kontrollu okunmasi ve yazilmasi
- Session invalid durumunda erken fail
- Gereksiz tekrar denemelerin sinirlanmasi
- Hesap suspend veya auth invalid sinyallerinin ayri ele alinmasi

### Riskler

- Yanlis health check, gecici UI degisikliklerini auth hatasi sanabilir.
- Cookie update mantigi dikkatli yazilmazsa eski veriyi ezebilir.

### Basari Kriterleri

- Auth invalid oturumlar daha erken tespit edilmeli
- Cookie tazelenmesi mevcut davranisi bozmamali
- Auth arizalari action queue'da kontrolsuz tekrar yaratmamali

---

## Faz 7: Premium Hesap Stratejisi

### Problem

Premium hesaba gecilmesi teorik olarak cok daha uzun iceriklere izin veriyor. Ancak bu limitin kendisini hedef yapmak, hesabin sesini bozabilir.

### Hedef

Premium'u duvar yazi yazmak icin degil, dogru yerde biraz daha derin icerik verebilmek icin kullanmak.

### Onerilen Kullanim Cercevesi

- Standart paylasimlar hala kisa ve okunabilir olmali
- Uzun tek tweetler nadir kullanilmali
- Thread kalitesi, thread sayisindan daha onemli olmali

### Onerilen Sinirlar

Not: 280 karakter hard limit degil; sadece standart/kisa formatin ust esigi olarak kullanilacak.

- Standart tweet: 120-280 karakter
- Guclu tek tweet: 280-600 karakter
- Nadir premium detayli tweet: 600-800 karakter
- Mini-thread: 4-7 tweet

### Ne Yapilmayacak

- 2000+ karakterlik duzenli post akisi kurulmayacak
- 25.000 karakter avantajina dayali bir icerik modeli tasarlanmayacak
- Her konuda thread zorlamasi yapilmayacak

### Uygulama Kapsami

- `src/content-generation/prompt-registry.ts`
- `src/content-generation/openrouter.service.ts`
- `src/x-automation/browser/x-post-flow.service.ts`

### Basari Kriterleri

- Premium kullanimlari timeline'da istisna gibi gorunmeli
- Daha uzun tweetler daha yuksek bilgi yogunlugu tasimali
- Okunurluk, linke bogulmamis net bir yapida korunmali

---

## Icerik Kimligi: Test Account Icin Onerilen Cizgi

Sorudaki kritik noktalardan biri su: sadece populer ve yukselen GitHub repolari mi paylasilmali?

Bu hesap icin en iyi denge su gorunuyor:

- Omurga: yukselen ve degerli GitHub repolari
- Katman 1: teknik gundem ve arac haberleri
- Katman 2: kisa orijinal yorumlar
- Katman 3: ara sira egitici mini-thread veya code tip

Yani hesap sadece link atan bir repo bulteni olmamali. Ama tamamen daginik bir genel teknoloji hesabina da donusmemeli.

### Onerilen Yaklasik Dagilim

- `%45` repo odakli paylasim
- `%20` teknik gundem / haber
- `%20` kisa gorus / karsilastirma / hot take
- `%10` code tip / mini egitici icerik
- `%5` premium detayli analiz veya mini-thread

Bu dagilim sabit kural degil, baslangic editoriyal rotasi olarak dusunulmeli.

### Yapilmayacaklar

Hesabin uzun vadeli guvenilirligi icin su kaliplardan uzak durulacak:

- Generic AI haberleri paylasilmayacak. Her AI haberi otomatik olarak degerli kabul edilmeyecek.
- Sadece link dump yapilmayacak. Link varsa mutlaka yorum, baglam veya secim gerekcesi olacak.
- Clickbait baslik uretilmeyecek. Merak uyandirmak tamam, abartili vaat ve manipulator baslik yok.
- Politik veya genel gundem disi tartismalara girilmeyecek. Hesap teknoloji, yazilim, AI tooling ve open source ekseninde kalacak.
- Cok sik `bu repo harika`, `mutlaka bak`, `efsane tool` gibi tekrar eden kaliplar kullanilmayacak.
- Sadece populer diye hesabin cizgisine uymayan repo veya haber paylasilmayacak.
- Kaynagi zayif, dogrulanmamis veya yuzeysel icerikler publish edilmeyecek.
- Her konu thread'e donusturulmeyecek. Thread sadece gercekten derinlik varsa kullanilacak.

---

## Fazlar Arasi Bagimliliklar

Fazlar birbirinden bagimsiz degil. En mantikli uygulama sirasi su:

1. Faz 6: Session guvenligi ve auth dayanikliligi
2. Faz 1: Tweet frekansi ve dagitim
3. Faz 5: Gunluk ritim ve aktivite pencereleri
4. Faz 3: Format ve stil cesitliligi
5. Faz 2: Icerik kaynaklarini genisletme
6. Faz 4: Organik davranis simulasyonu
7. Faz 7: Premium hesap stratejisi iyilestirmeleri

Bu siralamada once session guvenligi sertlestirilir. Sonra yayin frekansi ve gunluk ritim artirilir. Daha sonra icerik ve davranis cesitliligi genisletilir.

---

## Safety Toggles and Kill Switches

Her yeni buyume ozelligi config ile kontrol edilebilir olmali. Ozellikle post frekansi, organik davranis ve yeni kaynaklar tek tek kapatilabilmeli.

Onerilen toggle'lar:

- `GROWTH_MODE_ENABLED`: buyume davranislarini genel olarak acar/kapatir
- `RAMP_UP_ENABLED`: kademeli tweet artisini acar/kapatir
- `SOURCE_EXPANSION_ENABLED`: GitHub disi kaynaklari acar/kapatir
- `ORGANIC_BEHAVIOR_ENABLED`: organik browser davranisini acar/kapatir, default `false` olmali
- `PREMIUM_LENGTH_ENABLED`: uzun ve premium detayli formatlari acar/kapatir
- `STRICT_SESSION_HEALTH_ENABLED`: post oncesi session health check'i zorunlu hale getirir

Kill switch davranisi:

- Auth failure artarsa hesap otomatik pause'a alinmali
- Post failure rate belirli esigi gecerse yeni post enqueue durdurulmali
- X UI selector hatalari artarsa organik davranis otomatik kapanmali
- Duplicate veya kalite skoru dusuk icerik orani artarsa kaynak genisletme gecici kapatilabilmeli

Bu toggle'lar ilk etapta env veya settings tablosu uzerinden yonetilebilir. Uygulama ilerledikce admin API uzerinden degistirilebilir hale getirilebilir.

---

## Metrics and Feedback Loop

Plan sadece uygulanip birakilmayacak. Her fazin etkisi olculmeli ve sonraki fazlar bu veriye gore ayarlanmali.

Takip edilecek temel metrikler:

- Tweet basina impression
- Tweet basina reply, like, bookmark ve repost orani
- Profile visit rate
- Link click rate
- Format bazli engagement performansi
- Kaynak bazli performans: GitHub, Hacker News, Dev.to
- Duplicate prevention hit rate
- Publish edilmeyen icerik sayisi ve elenme nedeni
- Auth failure count
- Post failure rate
- Circuit breaker tetiklenme sayisi
- Session health check failure count

Geri besleme mantigi:

- Iyi performans veren formatlarin agirligi artirilmali
- Dusuk performansli kaynaklarin agirligi azaltilmali
- Auth veya post failure artarsa frekans otomatik dusmeli
- Weekend performansi hafta icinden iyiyse hafta sonu hacmi korunmali veya kontrollu artirilmali

---

## Faz Bazli Kabul Kriterleri

Her faz implementasyona gecmeden once su sorular net olmalidir:

1. Hangi dosyalar degisecek?
2. Yeni config gerekiyor mu?
3. DB migration gerekiyor mu?
4. Test impact alani neresi?
5. Basarili saymak icin hangi metrik izlenecek?

Implementasyon listesine cevirirken her faz icin ayrica su format kullanilmali:

- amac
- kod kapsami
- atomik gorevler
- riskler
- test/dogrulama adimlari

---

## Kisa Sonuc

Bu roadmap'in ana fikri su:

- Daha fazla tweet atacagiz ama sadece sayiyi arttirmayacagiz.
- Icerigi cesitlendirecegiz ama hesap kimligini dagitmayacagiz.
- Hesap davranisini daha zengin hale getirecegiz ama sistemi gereksiz karmasiklastirmayacagiz.
- Premium hesabi kullanacagiz ama uzunluk gosteri haline getirilmeyecek.

Bir sonraki adimda bu dokumani uygulama backlog'una, yani net implementasyon maddelerine cevirebiliriz.
