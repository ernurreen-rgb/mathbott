# QazMath Deployment Runbook

Current production topology:

- Frontend: Next.js in `web`, deployed to Vercel.
- Production frontend: `https://qazmath.vercel.app`
- Backend: FastAPI + SQLite in `bot`, deployed manually on the Google Cloud VPS with Docker Compose.
- Backend VPS path: `/opt/mathbott`
- Public backend HTTP endpoint: `http://35.225.92.22`
- Health endpoint: `http://35.225.92.22/api/health`

The Vercel frontend calls backend HTTP APIs through the same-origin proxy:

```text
https://qazmath.vercel.app/api/backend/...
```

The proxy forwards to:

```text
http://35.225.92.22/api/...
```

## Frontend Deploy

Use this when only files under `web` changed:

```bash
cd E:\CursorMathbot\web
npm.cmd run build
git status --short
git add <frontend files>
git commit -m "<message>"
git push origin main
npx.cmd vercel deploy --prod --scope yera1 --yes
```

## Backend Deploy

Use this when files under `bot` or backend deploy config changed.

Run local checks first:

```bash
cd E:\CursorMathbot\bot
python -m pytest tests/test_routes.py tests/test_repositories.py
```

Commit and push only the files for the current task:

```bash
cd E:\CursorMathbot
git status --short
git add <backend files>
git commit -m "<message>"
git push origin main
```

On the VPS, make a SQLite backup before rebuilding backend:

```bash
cd /opt/mathbott
ENV_FILE=.env.backend COMPOSE_FILE=docker-compose.backend.yml BACKUP_DIR=/opt/mathbot-backups ./deploy/scripts/backup-sqlite.sh
```

Recommended cron entry for daily online SQLite backups:

```cron
0 3 * * * cd /opt/mathbott && ENV_FILE=.env.backend COMPOSE_FILE=docker-compose.backend.yml BACKUP_DIR=/opt/mathbot-backups ./deploy/scripts/backup-sqlite.sh >> /var/log/mathbot-backup.log 2>&1
```

The backup script runs SQLite's online backup API inside the backend container, compresses the backup, and removes old `mathbot-*.db.gz` files according to `RETENTION_DAYS`.

Deploy backend:

```bash
cd /opt/mathbott
git fetch origin main
git reset --hard origin/main
sudo docker compose --env-file .env.backend -f docker-compose.backend.yml up -d --build backend
curl -sS http://127.0.0.1:8000/api/health
```

Check backend and Caddy logs:

```bash
cd /opt/mathbott
sudo docker compose --env-file .env.backend -f docker-compose.backend.yml ps
sudo docker compose --env-file .env.backend -f docker-compose.backend.yml logs --tail=200 backend caddy
```

## Required Runtime Variables

Backend `.env.backend` should include:

```env
ENVIRONMENT=production
INTERNAL_PROXY_SHARED_SECRET=<same strong secret as Vercel>
ALLOWED_ORIGINS=https://qazmath.vercel.app
ADMIN_EMAIL=<admin email>
```

Vercel production environment should include:

```env
BACKEND_URL=http://35.225.92.22
INTERNAL_PROXY_SHARED_SECRET=<same strong secret as backend>
NEXTAUTH_URL=https://qazmath.vercel.app
NEXTAUTH_SECRET=<strong random secret>
GOOGLE_CLIENT_ID=<google client id>
GOOGLE_CLIENT_SECRET=<google client secret>
NEXT_PUBLIC_API_URL=/api/backend
```

## WebSocket Backend TLS

Browser WebSocket traffic from the HTTPS frontend needs WSS, not plain WS. If live WebSocket features are enabled in production, expose the backend through TLS, for example:

```text
https://qazmath-api.35-225-92-22.sslip.io
wss://qazmath-api.35-225-92-22.sslip.io/ws/presence
```

Use `deploy/Caddyfile.backend.example` as the backend-only Caddy template. The VPS must allow public ports `80` and `443` so Caddy can issue and renew certificates.

Set Vercel production variable only when WSS is ready:

```env
NEXT_PUBLIC_WS_API_URL=https://qazmath-api.35-225-92-22.sslip.io
```

## Backup Notes

The last verified backup noted for this project was:

```text
mathbot-backup-20260515-163203.db
```

It was checked with `integrity_check ok`, 36 tables, 122 users, and 140 bank tasks.
