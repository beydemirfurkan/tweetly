# Production SSH Runbook

Bu dokuman, sonraki session'larda Tweetly prod ortamına SSH ile bağlanıp Coolify container'larını, Nest loglarını ve Postgres kuyruğunu güvenli şekilde incelemek için kullanılır.

## Güvenlik Kuralları

- Private key asla sohbete, commit'e veya dokumana yazılmaz.
- `.env`, token, cookie, `auth_token`, `ct0`, `OPENROUTER_API_KEY`, admin token gibi secret değerler terminal çıktısında gösterilmez.
- Prod DB'ye yazan komutlar sadece açık niyet varsa çalıştırılır.
- Önce read-only kontroller yapılır: container, log, queue, settings, account status.
- `git reset --hard`, `docker rm`, volume silme, DB truncate/drop gibi yıkıcı işlemler yapılmaz.

## SSH Bağlantısı

Bu makinede önerilen SSH alias:

```sshconfig
Host tweetly-prod
  HostName <redacted-ip>
  Port 22
  User root
  IdentityFile ~/.ssh/tweetly_prod
  IdentitiesOnly yes
```

Bağlantı testi:

```bash
ssh tweetly-prod "hostname && whoami && pwd"
```

Beklenen örnek çıktı:

```text
srv1233996
root
/root
```

Alias yoksa önce lokal Mac'te key oluştur:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tweetly_prod -C "tweetly-prod" -N ""
chmod 600 ~/.ssh/tweetly_prod
pbcopy < ~/.ssh/tweetly_prod.pub
```

Sonra public key'i sunucuda `root` kullanıcısının `~/.ssh/authorized_keys` dosyasına ekle. Private key'i paylaşma.

## Coolify Container Keşfi

Tweetly projesindeki container'ları listele:

```bash
ssh tweetly-prod "docker ps --filter label=coolify.projectName=tweetly --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Label \"coolify.resourceName\"}}'"
```

Beklenen resource isimleri:

```text
nest-service
panel
tweetly-db
```

Sunucuda interaktif devam etmek istersen:

```bash
ssh tweetly-prod
NEST=$(docker ps --filter label=coolify.resourceName=nest-service --format '{{.Names}}' | head -n1)
PANEL=$(docker ps --filter label=coolify.resourceName=panel --format '{{.Names}}' | head -n1)
DB=$(docker ps --filter label=coolify.resourceName=tweetly-db --format '{{.Names}}' | head -n1)
printf 'NEST=%s\nPANEL=%s\nDB=%s\n' "$NEST" "$PANEL" "$DB"
```

## Deploy Doğrulama

Son push sonrası Coolify redeploy yapıldı mı kontrol et:

```bash
ssh tweetly-prod "docker ps --filter label=coolify.projectName=tweetly --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Label \"coolify.resourceName\"}}'"
```

Image tag commit hash'i son git commit ile eşleşmeli. Lokal son commit:

```bash
git log -1 --oneline
```

Nest boot loglarını kontrol et:

```bash
ssh tweetly-prod 'NEST=$(docker ps --filter label=coolify.resourceName=nest-service --format "{{.Names}}" | head -n1); docker logs --since 10m "$NEST" 2>&1'
```

Önemli loglar:

```text
X_EXECUTOR_MODE defaulted to patchright
Registered executor: post
Registered executor: reply
Registered executor: like
Registered executor: bookmark
Registered executor: retweet
Registered executor: follow
Registered executor: quote
ClaimWorker started
Auto collect disabled by settings.
```

`Auto collect disabled by settings.` beklenen durumdur. Canary test yapılana kadar auto collect default kapalıdır.

## Secret Yazdırmadan Runtime Env Kontrolü

Sadece güvenli env alanlarını yazdır:

```bash
ssh tweetly-prod 'NEST=$(docker ps --filter label=coolify.resourceName=nest-service --format "{{.Names}}" | head -n1); docker exec "$NEST" sh -lc '\''env | sort | while IFS= read -r line; do case "$line" in X_EXECUTOR_MODE=*|NODE_ENV=*|NEST_PORT=*|DATA_DIR=*|USER_DATA_DIR=*|HEADLESS=*) echo "$line";; DATABASE_URL=*) echo DATABASE_URL=SET;; BOOTSTRAP_ADMIN_TOKEN=*) echo BOOTSTRAP_ADMIN_TOKEN=SET;; esac; done'\'''
```

Secret değerleri direkt `env` ile komple yazdırma.

## Postgres Bağlantısı

DB container içinde `POSTGRES_USER` ve `POSTGRES_DB` env'lerini kullan:

```bash
ssh tweetly-prod
DB=$(docker ps --filter label=coolify.resourceName=tweetly-db --format '{{.Names}}' | head -n1)
docker exec "$DB" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT now();"'
```

Tek komutla çalıştırmak için:

```bash
ssh tweetly-prod 'DB=$(docker ps --filter label=coolify.resourceName=tweetly-db --format "{{.Names}}" | head -n1); docker exec "$DB" sh -lc '\''psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT now();"'\'''
```

## Temel Sağlık Sorguları

Account cookie değerlerini yazdırmadan hesap durumunu kontrol et:

```sql
SELECT
  id,
  display_name,
  status,
  coalesce(length(auth_token), 0) > 0 AS has_auth_token,
  coalesce(length(ct0), 0) > 0 AS has_ct0,
  last_used_at
FROM accounts
ORDER BY id;
```

Çalıştırma:

```bash
ssh tweetly-prod 'DB=$(docker ps --filter label=coolify.resourceName=tweetly-db --format "{{.Names}}" | head -n1); docker exec "$DB" sh -lc '\''psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, display_name, status, coalesce(length(auth_token),0) > 0 AS has_auth_token, coalesce(length(ct0),0) > 0 AS has_ct0, last_used_at FROM accounts ORDER BY id;"'\'''
```

Queue depth:

```sql
SELECT 'post' AS type, status, count(*) FROM post_actions GROUP BY status
UNION ALL SELECT 'reply', status, count(*) FROM reply_actions GROUP BY status
UNION ALL SELECT 'like', status, count(*) FROM like_actions GROUP BY status
UNION ALL SELECT 'retweet', status, count(*) FROM retweet_actions GROUP BY status
UNION ALL SELECT 'quote', status, count(*) FROM quote_actions GROUP BY status
UNION ALL SELECT 'bookmark', status, count(*) FROM bookmark_actions GROUP BY status
UNION ALL SELECT 'follow', status, count(*) FROM follow_actions GROUP BY status
ORDER BY type, status;
```

Son post kayıtları:

```sql
SELECT
  id,
  account_id,
  status,
  attempts,
  scheduled_at,
  result_sent_at,
  result_tweet_url,
  metadata->>'sourceName' AS source_name,
  metadata->>'sourceType' AS source_type,
  metadata->>'format' AS format,
  metadata->>'repo' AS repo,
  substr(last_error, 1, 200) AS last_error
FROM post_actions
ORDER BY created_at DESC
LIMIT 20;
```

Canary queue preview:

```sql
SELECT
  id,
  status,
  scheduled_at,
  left(text, 220) AS text_preview,
  metadata->>'sourceName' AS source_name,
  metadata->>'sourceType' AS source_type,
  metadata->>'format' AS format,
  metadata->>'score' AS score,
  metadata->>'repo' AS repo
FROM post_actions
WHERE status IN ('pending', 'claimed', 'running', 'failed')
ORDER BY scheduled_at ASC
LIMIT 30;
```

Settings override kontrolü:

```sql
SELECT key, account_id, value, type
FROM settings
WHERE key IN (
  'tweets_per_day',
  'auto_collect.enabled',
  'auto_collect.run_hour',
  'source_expansion.enabled',
  'source_expansion.max_daily_candidates',
  'source_expansion.min_score',
  'format.no_link_hook.weight',
  'format.question.weight',
  'format.comparison.weight',
  'format.hot_take.weight',
  'format.repo_drop.weight',
  'format.mini_thread.weight',
  'format.repo_drop.link_as_reply',
  'format.adaptive.enabled'
)
ORDER BY account_id, key;
```

Engagement durumunu kontrol et:

```sql
SELECT
  account_id,
  enabled,
  bookmark_own_tweet,
  like_source_tweet,
  retweet_source_tweet,
  timeline_scrape_enabled,
  max_likes_per_day,
  max_retweets_per_day
FROM engagement_config
ORDER BY account_id;
```

## Canary Collect Akışı

Prod'a yeni creative safe mode deploy edildikten sonra önerilen sıra:

1. Container commit hash'i yeni commit mi kontrol et.
2. Nest loglarında executor register edildi mi kontrol et.
3. `auto_collect.enabled` kapalı mı kontrol et.
4. Queue depth'i oku.
5. Manuel collect tetikle.
6. Kuyruğa giren postları preview et.
7. İlk 1-2 postun `succeeded` olup olmadığını izle.
8. İçerik kalitesi iyiyse auto collect'i DB setting ile aç.

Manuel collect için panel kullanılabilir: `İçerik Topla > Toplama Başlat`.

API ile tetikleme gerekiyorsa admin token gerekir. Token'ı sohbete yazmadan lokal env veya güvenli shell değişkeniyle kullan:

```bash
curl -X POST \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://<nest-public-host>/admin/collect?account=test-account
```

Admin token yoksa DB'ye direkt enqueue yazma yerine panel kullanılmalı.

## Auto Collect Açma ve Kapama

Canary sonrası otomatik toplama açmak için DB setting kullanılabilir:

```sql
INSERT INTO settings (key, account_id, value, type, updated_at)
VALUES ('auto_collect.enabled', '', 'true', 'boolean', now())
ON CONFLICT (key, account_id)
DO UPDATE SET value = EXCLUDED.value, type = EXCLUDED.type, updated_at = now();
```

Acil kapatma:

```sql
INSERT INTO settings (key, account_id, value, type, updated_at)
VALUES ('auto_collect.enabled', '', 'false', 'boolean', now())
ON CONFLICT (key, account_id)
DO UPDATE SET value = EXCLUDED.value, type = EXCLUDED.type, updated_at = now();
```

Not: `SettingsService` cache TTL 60 saniyedir; değişiklik en geç 1 dakika içinde etkili olur.

## Kuyruk Davranışı

Deploy queue'yu sıfırlamaz. Queue Postgres'tedir.

Collect şu hesabı yapar:

```text
kalan = tweets_per_day - bugün_succeeded - aktif_kuyruk
```

Aktif kuyruk şu status'leri sayar:

```text
pending
claimed
running
failed ve attempts < max_attempts
```

Worker zamanı gelen kayıtları işler:

```text
pending/failed -> claimed -> running -> succeeded
running -> failed/dead
```

`failed` kayıtlar `scheduled_at` zamanı gelince ve `attempts < max_attempts` ise tekrar denenebilir.

## İçerik Stratejisi Defaultları

Creative safe mode defaultları:

```text
tweets_per_day=20
source_expansion.enabled=true
source_expansion.max_daily_candidates=5
source_expansion.min_score=75
format.no_link_hook.weight=5
format.question.weight=4
format.comparison.weight=3
format.hot_take.weight=3
format.repo_drop.weight=1
format.bookmark_bait.weight=1
format.mini_thread.weight=0
format.weekly_digest.weight=0
format.repo_drop.link_as_reply=false
format.adaptive.enabled=false
```

Engagement ilk aşamada kapalı tutulmalı:

```text
engagement_config.enabled=false
timeline_scrape_enabled=false
bookmark_own_tweet=false
like_source_tweet=false
retweet_source_tweet=false
```

## Log İnceleme

Son 10 dakika Nest log:

```bash
ssh tweetly-prod 'NEST=$(docker ps --filter label=coolify.resourceName=nest-service --format "{{.Names}}" | head -n1); docker logs --since 10m "$NEST" 2>&1'
```

Önemli akışları filtrele:

```bash
ssh tweetly-prod 'NEST=$(docker ps --filter label=coolify.resourceName=nest-service --format "{{.Names}}" | head -n1); docker logs --since 30m "$NEST" 2>&1 | grep -E "Auto collect|WorkflowDispatchService|GithubTrendingWorkflow|Source expansion|kuyruga|Patchright|post hata|Cookies injected|Auth|Timeout|Registered executor|ClaimWorker"'
```

## Prod Test Post

Sadece post executor'ı doğrulamak için tek test post kuyruğa elle eklenebilir. Bu gerçek tweet atar, dikkatli kullan:

```sql
INSERT INTO post_actions (account_id, idempotency_key, scheduled_at, metadata, text)
VALUES (
  'test-account',
  'prod-smoke-post-' || extract(epoch from now())::text,
  now(),
  '{"source":"manual-prod-smoke"}'::jsonb,
  'tweetly prod smoke test - ' || now()::text
)
RETURNING id;
```

Sonucu izle:

```sql
SELECT status, attempts, result_tweet_url, substr(last_error, 1, 200) AS last_error
FROM post_actions
WHERE id = '<returned-id>';
```

Bu yöntem sadece açık onayla kullanılmalı.

## Troubleshooting

Executor register yoksa:

```text
X_EXECUTOR_MODE patchright değil veya default kod deploy edilmemiş olabilir.
```

Post `auth` hatası alırsa:

```text
accounts.auth_token veya ct0 yenilenmeli.
Cookie değerleri DB'de account bazlı saklanır, env'e yazılmaz.
```

Collect hiç tweet üretmiyorsa:

```text
Bugünkü succeeded + aktif kuyruk hedefi doldurmuş olabilir.
GitHub/HN/dev.to adayları dedupe veya min score filtresine takılmış olabilir.
OpenRouter API key eksik olabilir.
```

Queue dolu ama tweet atmıyorsa:

```text
scheduled_at gelecekte olabilir.
Worker loglarında hata olabilir.
Circuit breaker/account pause olabilir.
failed kayıt attempts >= max_attempts ise retry edilmez.
```

## Session Başlangıç Checklist

Yeni session'da hızlı durum almak için:

```bash
ssh tweetly-prod "hostname && whoami"
ssh tweetly-prod "docker ps --filter label=coolify.projectName=tweetly --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Label \"coolify.resourceName\"}}'"
git log -1 --oneline
git status --short
```

Sonra sırayla:

```text
1. Nest image commit'i son commit mi?
2. Executor register logları var mı?
3. Account active ve auth_token var mı?
4. Queue depth nasıl?
5. Pending postların scheduled_at ve text preview'ı iyi mi?
6. Failed/dead kayıt var mı?
7. Auto collect açık mı kapalı mı?
```
