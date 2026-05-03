# Faz 0: Guvenlik ve Temel

## Sure
1 gun

## Hedefler
- Secret sızıntı riskini kapatmak
- Config yapısını genisletmek
- Mevcut kodu dokumante etmek

## Gorevler

### 0.1 .env.example Genisletme
**Dosya:** `.env.example`

Mevcut:
```
X_AUTH_TOKEN=
OPENROUTER_API_KEY=sk-or-v1-...
ADMIN_TOKEN=
```

Hedef:
```
# X Session (zorunlu)
X_AUTH_TOKEN=
X_AUTH_MULTI=
X_CT0=
X_TWID=

# AI (zorunlu)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=google/gemini-2.5-flash

# Admin (zorunlu)
ADMIN_TOKEN=

# Pipeline (opsiyonel)
TWEETS_PER_DAY=20
DISPATCH_START_HOUR=9
MAX_ATTEMPTS=3

# Server (opsiyonel)
PORT=3000
HEADLESS=true

# Paths (opsiyonel - Docker icin)
# DATA_DIR=/data/app-data
# USER_DATA_DIR=/data/user-data
```

### 0.2 Config Parametrelerini Environment'a Tasima
**Dosya:** `src/config/index.ts`

- `tweetsPerDay` zaten env'den geliyor (TWEETS_PER_DAY)
- `dispatchStartHour` zaten env'den geliyor (DISPATCH_START_HOUR)
- `dispatchIntervalMin` hard-coded 30, env yapilandirmali yap
- `scheduleJitterMin` ve `scheduleJitterMax` hard-coded, env yapilandirmali yap
- `circuitBreakerFailures` ve `circuitBreakerPauseMin` env yapilandirmali yap

### 0.3 .gitignore Guvenlik Guncellemesi
**Dosya:** `.gitignore`

Eklenecekler:
```
data/content-memory.json
data/control.json
docs/
```

### 0.4 user-data.tar.gz Risk Dokumantasyonu
**Dosya:** `README.md`

- `user-data.tar.gz` dosyasinin ne icerdigini acikla
- Bu dosyanin repoya commit edilmemesi gerektigini belirt
- `.gitignore`'da kontrol et

### 0.5 README.md Iyilestirmesi
**Dosya:** `README.md`

- Tum env degiskenlerini dokumante et
- Session yenileme prosedurunu ekle
- Guvenlik notlarini ekle

## Kabul Kriterleri
- [ ] .env.example tum degiskenleri iceriyor
- [ ] Config parametreleri .env uzerinden yapilandirilabiliyor
- [ ] .gitignore guncel
- [ ] README.md guncel
- [ ] Mevcut testler (yoksa lint/typecheck) geciyor

## Riskler
- Config degisiklikleri mevcut Docker deploy'i etkileyebilir
- .env.example'e eklenen degiskenler mevcut .env'de yoksa default degerlerle calisir

## Bagimliliklar
Yok

## Notlar
- Faz 0'da yeni ozellik eklenmiyor, sadece temel guvenlik ve dokumantasyyon
- Bu faz tamamlanmadan diger fazlara gecilmemeli
