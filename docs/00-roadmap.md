# Tweetly Roadmap

## Şu Anki Durum (2026-05-03)

Bu projenin orijinal roadmap'i (Faz 0–5: güvenlik, format motoru, reply
flow, analytics, scoring, monetizasyon) `archive/` altında. Çoğu hayata
geçti veya çok daha kapsamlı bir mimariye dönüştü:

- **Action engine + queue uniformity** — 15 ActionType, hepsi action
  engine üzerinden idempotent + retry'lı çalışıyor.
- **MCP tool surface** — 43 araç, 5 handler dosyasına bölünmüş, runtime
  Zod parsing + drift testleri.
- **Multi-tenant auth** — kullanıcı izolasyonu integration test'leriyle
  pinned.
- **Observability** — Prometheus metrics (`/metrics`): queue depth, lag,
  action duration, circuit breaker state.
- **Operability** — GitHub Actions CI (build + unit + integration),
  migration runbook + Coolify pre-deploy hook, queue alarm templates.
- **Test foundation** — 357 unit + 24 integration spec, hepsi CI'da.

## Mimari Genel Bakış

Yeni katkıcılar için kısa harita:

```
MCP client ──▶ mcp.service (router)
              └─▶ handlers/{write,profile,read,monitor,account}
                  ├─▶ enqueue (queue-backed writes)
                  └─▶ xDirect / xBrowser (sync reads)

ClaimWorker ──▶ ExecutorRegistry ──▶ executors/<type>.executor
                                      └─▶ xDirect (Playwright)
```

Dökümanlar:

- `09-data-models.md` — DB tabloları ve action engine state machine
- `10-multi-account-plan.md` — multi-tenant auth modeli
- `11-migration-runbook.md` — DB migration süreci ve Coolify entegrasyonu
- `12-queue-alarms.md` — Prometheus alert template'leri
- `07-algorithm-analysis.md` — X algoritma analizi (içerik stratejisi
  için kalıcı referans)
- `08-content-strategy.md` — içerik stratejisi
- `archive/` — orijinal Faz 0–5 roadmap'i (tarihçe)

## Açık Yön

Önceki roadmap'in monetizasyon ve content-strategy kısımları büyük
ölçüde "henüz başlanmamış" durumda. Mimari altyapı sağlam — production
ölçeğinde güvenle yeni özellik eklenebilir hale geldi. Sıradaki strate-
jik adım: hangi içerik formatına yatırım yapılacak ve ne ölçer? — bu
ürün kararı, mühendislik kararı değil.
