# Mathbot - РћР±СЂР°Р·РѕРІР°С‚РµР»СЊРЅР°СЏ РїР»Р°С‚С„РѕСЂРјР° РґР»СЏ СЂРµС€РµРЅРёСЏ РјР°С‚РµРјР°С‚РёС‡РµСЃРєРёС… Р·Р°РґР°С‡

## Docker Compose (Recommended)

Run the full stack (backend + frontend) with one command:

```bash
docker compose up --build -d
```

Useful commands:

```bash
docker compose ps
docker compose logs -f backend frontend
docker compose down
```

Compose environment variables (set in shell or `.env` near `docker-compose.yml`):

```env
NEXTAUTH_SECRET=change-me-in-production
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_SECRET=change-me-in-production
ADMIN_EMAIL=
```

## Production Deploy (VPS + Docker Compose)

Use the dedicated production stack instead of `docker-compose.yml`.

1. Copy `.env.production.example` to `.env.production`
2. Fill in `APP_DOMAIN`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_*`, `INTERNAL_PROXY_SHARED_SECRET`, and `ADMIN_EMAIL`
3. Point your DNS `A` record to the VPS
4. Start the stack:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Useful checks:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy frontend backend
```

Notes:

- Only Caddy is exposed publicly (`80` / `443`)
- Backend REST stays private inside Compose
- SQLite lives in the `mathbot_db` volume
- Uploaded images live in the `mathbot_images` volume
- Coop realtime falls back to polling in the first secure production rollout

## Production Deploy Behind Existing Nginx

If your VPS already runs nginx for other projects, use the nginx-specific stack instead of Caddy:

```bash
docker compose --env-file .env.production -f docker-compose.prod.nginx.yml up -d --build
```

Behavior:

- Frontend binds only to `127.0.0.1:${FRONTEND_BIND_PORT:-3001}`
- Backend remains private inside Docker
- Public `80/443` continue to be owned by your existing nginx

Use the template at `deploy/nginx/mathbot.conf.example` as a separate nginx site file with a unique `server_name`.
Mathbot - СЌС‚Рѕ РїРѕР»РЅРѕС„СѓРЅРєС†РёРѕРЅР°Р»СЊРЅР°СЏ РїР»Р°С‚С„РѕСЂРјР° РґР»СЏ РёР·СѓС‡РµРЅРёСЏ РјР°С‚РµРјР°С‚РёРєРё СЃ РІРµР±-РёРЅС‚РµСЂС„РµР№СЃРѕРј.

## рџЏ—пёЏ РђСЂС…РёС‚РµРєС‚СѓСЂР°

РџСЂРѕРµРєС‚ СЃРѕСЃС‚РѕРёС‚ РёР· РґРІСѓС… РѕСЃРЅРѕРІРЅС‹С… РєРѕРјРїРѕРЅРµРЅС‚РѕРІ:

### Backend (FastAPI + SQLite)
- **РўРµС…РЅРѕР»РѕРіРёРё**: FastAPI, Python, SQLite (aiosqlite), uvicorn
- **Р‘Р°Р·Р° РґР°РЅРЅС‹С…**: SQLite СЃ WAL СЂРµР¶РёРјРѕРј РґР»СЏ СѓР»СѓС‡С€РµРЅРЅРѕР№ РїСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚Рё
- **API**: RESTful API СЃ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРѕР№ РґРѕРєСѓРјРµРЅС‚Р°С†РёРµР№ (Swagger)
- **РђСѓС‚РµРЅС‚РёС„РёРєР°С†РёСЏ**: NextAuth.js (Google OAuth) РґР»СЏ РІРµР±-РёРЅС‚РµСЂС„РµР№СЃР°
- **РљСЌС€РёСЂРѕРІР°РЅРёРµ**: In-memory РєСЌС€ РґР»СЏ С‡Р°СЃС‚Рѕ Р·Р°РїСЂР°С€РёРІР°РµРјС‹С… РґР°РЅРЅС‹С…
- **Rate Limiting**: Р—Р°С‰РёС‚Р° РѕС‚ Р·Р»РѕСѓРїРѕС‚СЂРµР±Р»РµРЅРёР№ СЃ РїРѕРјРѕС‰СЊСЋ slowapi

### Frontend (Next.js + React)
- **РўРµС…РЅРѕР»РѕРіРёРё**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **РЎРѕСЃС‚РѕСЏРЅРёРµ**: React Query РґР»СЏ РєСЌС€РёСЂРѕРІР°РЅРёСЏ Рё СѓРїСЂР°РІР»РµРЅРёСЏ СЃРѕСЃС‚РѕСЏРЅРёРµРј
- **UI**: Tailwind CSS РґР»СЏ СЃС‚РёР»РёР·Р°С†РёРё, KaTeX Рё MathLive РґР»СЏ РјР°С‚РµРјР°С‚РёС‡РµСЃРєРёС… С„РѕСЂРјСѓР»
- **РђСѓС‚РµРЅС‚РёС„РёРєР°С†РёСЏ**: NextAuth.js СЃ Google Provider
- **UX**: Skeleton loaders, Toast СѓРІРµРґРѕРјР»РµРЅРёСЏ, Error boundaries

## рџ“Ѓ РЎС‚СЂСѓРєС‚СѓСЂР° РїСЂРѕРµРєС‚Р°

```
CursorMathbot/
в”њв”Ђв”Ђ bot/                    # Backend (FastAPI)
в”‚   в”њв”Ђв”Ђ main.py            # Р“Р»Р°РІРЅС‹Р№ С„Р°Р№Р» РїСЂРёР»РѕР¶РµРЅРёСЏ
в”‚   в”њв”Ђв”Ђ database.py        # Р Р°Р±РѕС‚Р° СЃ Р±Р°Р·РѕР№ РґР°РЅРЅС‹С…
в”‚   в”њв”Ђв”Ђ routes/            # API endpoints
в”‚   в”‚   в”њв”Ђв”Ђ modules.py    # РњРѕРґСѓР»Рё, СЃРµРєС†РёРё, СѓСЂРѕРєРё
в”‚   в”‚   в”њв”Ђв”Ђ tasks.py       # Р—Р°РґР°С‡Рё Рё РїСЂРѕРІРµСЂРєР° РѕС‚РІРµС‚РѕРІ
в”‚   в”‚   в””в”Ђв”Ђ users.py       # РџРѕР»СЊР·РѕРІР°С‚РµР»Рё Рё СЂРµР№С‚РёРЅРі
в”‚   в”њв”Ђв”Ђ models/            # Pydantic РјРѕРґРµР»Рё
в”‚   в”‚   в”њв”Ђв”Ђ requests.py    # РњРѕРґРµР»Рё Р·Р°РїСЂРѕСЃРѕРІ
в”‚   в”‚   в””в”Ђв”Ђ db_models.py   # РњРѕРґРµР»Рё Р‘Р”
в”‚   в”њв”Ђв”Ђ utils/             # РЈС‚РёР»РёС‚С‹
в”‚   в”‚   в”њв”Ђв”Ђ cache.py       # РљСЌС€РёСЂРѕРІР°РЅРёРµ
в”‚   в”‚   в”њв”Ђв”Ђ validation.py  # Р’Р°Р»РёРґР°С†РёСЏ
в”‚   в”‚   в””в”Ђв”Ђ logging_config.py
в”‚   в”њв”Ђв”Ђ middleware/        # Middleware
в”‚   в”‚   в”њв”Ђв”Ђ error_handler.py
в”‚   в”‚   в””в”Ђв”Ђ metrics_middleware.py
в”‚   в”њв”Ђв”Ђ migrations/        # РњРёРіСЂР°С†РёРё Р‘Р”
в”‚   в””в”Ђв”Ђ tests/             # РўРµСЃС‚С‹
в”‚
в”њв”Ђв”Ђ web/                    # Frontend (Next.js)
в”‚   в”њв”Ђв”Ђ app/               # Next.js App Router
в”‚   в”‚   в”њв”Ђв”Ђ page.tsx      # Р“Р»Р°РІРЅР°СЏ СЃС‚СЂР°РЅРёС†Р°
в”‚   в”‚   в”њв”Ђв”Ђ profile/       # РџСЂРѕС„РёР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
в”‚   в”‚   в”њв”Ђв”Ђ rating/        # Р РµР№С‚РёРЅРі
в”‚   в”‚   в”њв”Ђв”Ђ league/        # Р›РёРіРё
в”‚   в”‚   в”њв”Ђв”Ђ lessons/       # РЈСЂРѕРєРё
в”‚   в”‚   в””в”Ђв”Ђ admin/         # РђРґРјРёРЅ-РїР°РЅРµР»СЊ
в”‚   в”њв”Ђв”Ђ components/        # React РєРѕРјРїРѕРЅРµРЅС‚С‹
в”‚   в”‚   в”њв”Ђв”Ђ ui/           # UI РєРѕРјРїРѕРЅРµРЅС‚С‹
в”‚   в”‚   в””в”Ђв”Ђ ...
в”‚   в”њв”Ђв”Ђ lib/               # РЈС‚РёР»РёС‚С‹ Рё С…СѓРєРё
в”‚   в”‚   в”њв”Ђв”Ђ api.ts        # API РєР»РёРµРЅС‚
в”‚   в”‚   в”њв”Ђв”Ђ hooks/        # React Query С…СѓРєРё
в”‚   в”‚   в””в”Ђв”Ђ toast.ts      # Toast СѓРІРµРґРѕРјР»РµРЅРёСЏ
в”‚   в””в”Ђв”Ђ types/             # TypeScript С‚РёРїС‹
в”‚
в””в”Ђв”Ђ QUICKSTART.md          # Р‘С‹СЃС‚СЂС‹Р№ СЃС‚Р°СЂС‚
```

## рџљЂ Р‘С‹СЃС‚СЂС‹Р№ СЃС‚Р°СЂС‚

РџРѕРґСЂРѕР±РЅС‹Рµ РёРЅСЃС‚СЂСѓРєС†РёРё РїРѕ СѓСЃС‚Р°РЅРѕРІРєРµ Рё Р·Р°РїСѓСЃРєСѓ РЅР°С…РѕРґСЏС‚СЃСЏ РІ [QUICKSTART.md](QUICKSTART.md).

### Backend

```bash
cd bot
pip install -r requirements.txt
export PORT=8000
python main.py
```

### Frontend

```bash
cd web
npm install
npm run dev
```

## рџ—„пёЏ Р‘Р°Р·Р° РґР°РЅРЅС‹С…

РџСЂРѕРµРєС‚ РёСЃРїРѕР»СЊР·СѓРµС‚ SQLite СЃ WAL (Write-Ahead Logging) СЂРµР¶РёРјРѕРј РґР»СЏ СѓР»СѓС‡С€РµРЅРЅРѕР№ РїСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚Рё Рё РєРѕРЅРєСѓСЂРµРЅС‚РЅРѕСЃС‚Рё.

### РћСЃРЅРѕРІРЅС‹Рµ С‚Р°Р±Р»РёС†С‹:
- `users` - РџРѕР»СЊР·РѕРІР°С‚РµР»Рё
- `modules`, `sections`, `lessons`, `mini_lessons` - РЎС‚СЂСѓРєС‚СѓСЂР° РєСѓСЂСЃР°
- `tasks` - Р—Р°РґР°С‡Рё
- `user_progress` - РџСЂРѕРіСЂРµСЃСЃ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№
- `solutions` - Р РµС€РµРЅРёСЏ Р·Р°РґР°С‡
- `user_achievements` - Р”РѕСЃС‚РёР¶РµРЅРёСЏ
- `trial_tests` - РџСЂРѕР±РЅС‹Рµ С‚РµСЃС‚С‹

## рџ”§ РћСЃРЅРѕРІРЅС‹Рµ С„СѓРЅРєС†РёРё

### Р”Р»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№:
- Р РµС€РµРЅРёРµ РјР°С‚РµРјР°С‚РёС‡РµСЃРєРёС… Р·Р°РґР°С‡ СЃ СЂР°Р·Р»РёС‡РЅС‹РјРё С‚РёРїР°РјРё РІРѕРїСЂРѕСЃРѕРІ (input, MCQ, True/False)
- РЎРёСЃС‚РµРјР° РїСЂРѕРіСЂРµСЃСЃР° РїРѕ РјРѕРґСѓР»СЏРј, СЃРµРєС†РёСЏРј Рё СѓСЂРѕРєР°Рј
- Р РµР№С‚РёРЅРі Рё Р»РёРіРё
- Р”РѕСЃС‚РёР¶РµРЅРёСЏ Рё СЃС‚Р°С‚РёСЃС‚РёРєР°
- РџСЂРѕС„РёР»СЊ СЃ РЅР°СЃС‚СЂРѕР№РєР°РјРё

### Р”Р»СЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ:
- CMS РґР»СЏ СѓРїСЂР°РІР»РµРЅРёСЏ РєРѕРЅС‚РµРЅС‚РѕРј
- РЎРѕР·РґР°РЅРёРµ Рё СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РјРѕРґСѓР»РµР№, СЃРµРєС†РёР№, СѓСЂРѕРєРѕРІ, Р·Р°РґР°С‡
- РЈРїСЂР°РІР»РµРЅРёРµ РїСЂРѕР±РЅС‹РјРё С‚РµСЃС‚Р°РјРё
- РџСЂРѕСЃРјРѕС‚СЂ СЃС‚Р°С‚РёСЃС‚РёРєРё

## рџ“Љ РџСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚СЊ

РџСЂРѕРµРєС‚ РѕРїС‚РёРјРёР·РёСЂРѕРІР°РЅ РґР»СЏ РїСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚Рё:
- **РљСЌС€РёСЂРѕРІР°РЅРёРµ**: In-memory РєСЌС€ РґР»СЏ РјРѕРґСѓР»РµР№, СЂРµР№С‚РёРЅРіР°, СЃС‚Р°С‚РёСЃС‚РёРєРё РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№
- **РћРїС‚РёРјРёР·РёСЂРѕРІР°РЅРЅС‹Рµ Р·Р°РїСЂРѕСЃС‹**: JOIN Р·Р°РїСЂРѕСЃС‹ РІРјРµСЃС‚Рѕ РјРЅРѕР¶РµСЃС‚РІРµРЅРЅС‹С… SELECT
- **Batch РѕРїРµСЂР°С†РёРё**: Р“СЂСѓРїРїРѕРІС‹Рµ Р·Р°РїСЂРѕСЃС‹ РґР»СЏ СЂР°СЃС‡РµС‚Р° РїСЂРѕРіСЂРµСЃСЃР°
- **React Query**: РљСЌС€РёСЂРѕРІР°РЅРёРµ Рё РґРµРґСѓРїР»РёРєР°С†РёСЏ Р·Р°РїСЂРѕСЃРѕРІ РЅР° С„СЂРѕРЅС‚РµРЅРґРµ

## рџ”’ Р‘РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ

- CORS РєРѕРЅС„РёРіСѓСЂР°С†РёСЏ
- Rate limiting РґР»СЏ Р·Р°С‰РёС‚С‹ РѕС‚ Р·Р»РѕСѓРїРѕС‚СЂРµР±Р»РµРЅРёР№
- Р’Р°Р»РёРґР°С†РёСЏ РІС…РѕРґРЅС‹С… РґР°РЅРЅС‹С… (Pydantic)
- РЎР°РЅРёС‚РёР·Р°С†РёСЏ HTML РєРѕРЅС‚РµРЅС‚Р°
- РђСѓС‚РµРЅС‚РёС„РёРєР°С†РёСЏ С‡РµСЂРµР· NextAuth.js

## рџ§Є РўРµСЃС‚РёСЂРѕРІР°РЅРёРµ

```bash
# Backend С‚РµСЃС‚С‹
cd bot
python -m pytest tests/

# Frontend С‚РµСЃС‚С‹
cd web
npm test
```

## рџ“ќ API Р”РѕРєСѓРјРµРЅС‚Р°С†РёСЏ

РџРѕСЃР»Рµ Р·Р°РїСѓСЃРєР° backend, API РґРѕРєСѓРјРµРЅС‚Р°С†РёСЏ РґРѕСЃС‚СѓРїРЅР° РїРѕ Р°РґСЂРµСЃСѓ:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## рџ› пёЏ Р Р°Р·СЂР°Р±РѕС‚РєР°

### РўСЂРµР±РѕРІР°РЅРёСЏ:
- Python 3.8+
- Node.js 18+
- npm РёР»Рё yarn

### РџРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ:

**Backend (.env):**
```
PORT=8000
ADMIN_EMAIL=admin@example.com
ADMIN_SECRET=your-secret-key
ENVIRONMENT=development
LOG_LEVEL=INFO
```

**Frontend (.env.local):**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## рџ“€ РњРµС‚СЂРёРєРё Рё РјРѕРЅРёС‚РѕСЂРёРЅРі

- Health check endpoint: `/api/health`
- РњРµС‚СЂРёРєРё РґРѕСЃС‚СѓРїРЅС‹ С‡РµСЂРµР· middleware
- Р›РѕРіРёСЂРѕРІР°РЅРёРµ РЅР°СЃС‚СЂРѕРµРЅРѕ РґР»СЏ production

## рџ¤ќ Р’РєР»Р°Рґ РІ РїСЂРѕРµРєС‚

РџСЂРѕРµРєС‚ РЅР°С…РѕРґРёС‚СЃСЏ РІ Р°РєС‚РёРІРЅРѕР№ СЂР°Р·СЂР°Р±РѕС‚РєРµ. Р’СЃРµ СѓР»СѓС‡С€РµРЅРёСЏ РїСЂРёРІРµС‚СЃС‚РІСѓСЋС‚СЃСЏ!

## рџ“„ Р›РёС†РµРЅР·РёСЏ

[РЈРєР°Р¶РёС‚Рµ Р»РёС†РµРЅР·РёСЋ]

## рџ‘Ґ РђРІС‚РѕСЂС‹

Yera


