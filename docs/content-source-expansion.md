# Content source expansion

Bu faz GitHub Trending disinda kaliteli teknik kaynaklari ana icerik pipeline'ina kontrollu sekilde ekler.

## Hedef

- Test Account hesabinin sadece repo bulteni gibi gorunmesini engellemek.
- AI, coding, developer tools, infra, frontend/backend ve open-source konularinda daha erken sinyal yakalamak.
- Kaynak genisletmeyi feature flag ile kontrollu acmak.

## Ilk kaynaklar

- `hacker_news`: HN top stories API uzerinden teknik tartisma sinyali yuksek linkler.
- `dev_to`: dev.to top articles API uzerinden gelistirici odakli yazilar.

GitHub Trending ana kaynak olarak kalir. Harici kaynaklar sadece `source_expansion.enabled=true` oldugunda pipeline'a girer.

## Scoring modeli

Harici kaynaklar `source_score` ile 0+ puanlanir. Varsayilan guclu yayin esigi `70` puandir.

- `source`: kaynagin guveni.
- `topic`: konu Test Account hesabina uyuyor mu.
- `freshness`: yayin/tartisma ne kadar yeni.
- `discussion`: yorum, puan veya reaksiyon sinyali.
- `accountFit`: AI/coding/dev-tool/open-source eksenine uygunluk.
- `penalty`: off-brand veya zayif baslik cezasi.

Kurallar:

- `source_score >= 70`: guclu aday.
- `source_score < 70`: yayin pipeline'ina girmez.
- Zayif, politik, magazin, crypto/web3 odakli veya sadece funding/announcement kokan basliklar cezalandirilir.

## Admin settings

Varsayilan creative safe mode:

- `source_expansion.enabled=true`
- `source_expansion.hacker_news.enabled=true`
- `source_expansion.dev_to.enabled=true`
- `source_expansion.hacker_news.limit=25`
- `source_expansion.dev_to.limit=25`
- `source_expansion.max_daily_candidates=5`
- `source_expansion.min_score=75`

Scoring agirliklari:

- `source_scoring.source_trust=20`
- `source_scoring.topic_fit=25`
- `source_scoring.freshness=20`
- `source_scoring.discussion=15`
- `source_scoring.account_fit=20`
- `source_scoring.weak_title_penalty=-15`

## Guvenli acilis

1. Once sadece ayarlari gor: `GET /admin/settings`.
2. `source_expansion.enabled=true` yap, fakat growth hedeflerini ayni tut.
3. Ilk gun `source_expansion.max_daily_candidates=5` ile basla.
4. Queue metadata'sinda `source`, `sourceType`, `sourceName`, `sourceScore` alanlarini izle.
5. Kalite iyi ise `max_daily_candidates` degerini 10-15 araligina cikar.

## Beklenen etki

- Daha fazla news/opinion/hot-take malzemesi.
- GitHub disi trendleri erken yakalama.
- Repo tanitimi, teknik yorum, kisa analiz ve soru formatlari arasinda daha dogal cesitlilik.
