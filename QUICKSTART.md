## Контейнерный запуск (рекомендуется)

Поднять весь проект одной командой:

```bash
docker compose up --build -d
```

Проверка статуса:

```bash
docker compose ps
docker compose logs -f backend frontend
```

Остановка:

```bash
docker compose down
```

Переменные окружения для compose (задаются в shell или `.env` рядом с `docker-compose.yml`):

```env
NEXTAUTH_SECRET=change-me-in-production
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_SECRET=change-me-in-production
ADMIN_EMAIL=
```
# Р‘С‹СЃС‚СЂС‹Р№ СЃС‚Р°СЂС‚ Mathbot

## 1. Backend (API)

```bash
cd bot
pip install -r requirements.txt
export PORT=8000
python main.py
```

### Windows (PowerShell)

```powershell
cd bot
pip install -r requirements.txt
$env:PORT="8000"
python main.py
```

API Р·Р°РїСѓСЃС‚РёС‚СЃСЏ РЅР° `http://localhost:8000`

## 2. Frontend (Р’РµР±-РёРЅС‚РµСЂС„РµР№СЃ)

```bash
cd web
npm install
```

РЎРѕР·РґР°Р№С‚Рµ `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional (debug / logs)
# NEXTAUTH_DEBUG=true
# NEXT_PUBLIC_DEBUG_API=true
# NEXT_PUBLIC_DEBUG_UI=true
```

Р—Р°РїСѓСЃС‚РёС‚Рµ:
```bash
npm run dev
```

Р’РµР±-РёРЅС‚РµСЂС„РµР№СЃ Р±СѓРґРµС‚ РґРѕСЃС‚СѓРїРµРЅ РЅР° `http://localhost:3000`

## РџРµСЂРІС‹Рµ С€Р°РіРё

1. **Р’РµР±-РёРЅС‚РµСЂС„РµР№СЃ**: РћС‚РєСЂРѕР№С‚Рµ `http://localhost:3000` Рё РІРѕР№РґРёС‚Рµ С‡РµСЂРµР· Google
2. **Р”РѕР±Р°РІСЊС‚Рµ Р·Р°РґР°С‡Сѓ**: РСЃРїРѕР»СЊР·СѓР№С‚Рµ Р°РґРјРёРЅ-РїР°РЅРµР»СЊ РІ РІРµР±-РёРЅС‚РµСЂС„РµР№СЃРµ
3. **Р РµС€РёС‚Рµ Р·Р°РґР°С‡Сѓ**: РСЃРїРѕР»СЊР·СѓР№С‚Рµ РєРЅРѕРїРєСѓ "РќРѕРІР°СЏ Р·Р°РґР°С‡Р°" РІ РІРµР±-РёРЅС‚РµСЂС„РµР№СЃРµ

## РќР°СЃС‚СЂРѕР№РєР° Google OAuth

1. РџРµСЂРµР№РґРёС‚Рµ РІ [Google Cloud Console](https://console.cloud.google.com/)
2. РЎРѕР·РґР°Р№С‚Рµ РЅРѕРІС‹Р№ РїСЂРѕРµРєС‚
3. Р’РєР»СЋС‡РёС‚Рµ Google+ API
4. РЎРѕР·РґР°Р№С‚Рµ OAuth 2.0 credentials
5. Р”РѕР±Р°РІСЊС‚Рµ `http://localhost:3000/api/auth/callback/google` РІ authorized redirect URIs
6. РЎРєРѕРїРёСЂСѓР№С‚Рµ Client ID Рё Client Secret РІ `.env.local`


