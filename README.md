# Mathbott

Mathbott is a math learning platform built with:

- `FastAPI` backend
- `Next.js` frontend
- `SQLite` for persistence
- `Docker Compose` for local and production deployment

The repository already includes:

- local development stack
- production stack behind existing `nginx`
- production stack that pulls prebuilt images from Docker Hub
- admin UI, trial tests, coop mode, reporting, and content management

## Stack

### Backend

- `Python 3.11`
- `FastAPI`
- `SQLite`
- `Pydantic`
- background alerts and Sentry integration

### Frontend

- `Next.js 14`
- `React 18`
- `TypeScript`
- `Tailwind CSS`
- `NextAuth` with Google OAuth

## Repository Layout

```text
bot/                           FastAPI backend
web/                           Next.js frontend
deploy/nginx/                  nginx templates for production
docker-compose.yml             local development stack
docker-compose.prod.yml        production stack with Caddy
docker-compose.prod.nginx.yml  production stack behind existing nginx
docker-compose.prod.nginx.hub.yml  production stack behind nginx using Docker Hub images
.env.production.example        production env template
```

## Local Development

### Option 1: Docker Compose

Start the full local stack:

```bash
docker compose up -d --build
```

Useful commands:

```bash
docker compose ps
docker compose logs -f backend frontend
docker compose down
```

### Option 2: Run Services Separately

Backend:

```bash
cd bot
pip install -r requirements.txt
python main.py
```

Frontend:

```bash
cd web
npm install
npm run dev
```

## Local Environment Files

Use these files only for local development:

- `bot/.env.local`
- `web/.env.local`

Do not commit local env files.

## Production Environment

Use a separate root-level file for production:

- `.env.production`

Create it from the template:

```bash
cp .env.production.example .env.production
```

Do not commit `.env.production`.

Minimum required values:

```env
APP_DOMAIN=your-domain.example
FRONTEND_BIND_PORT=3001

NEXTAUTH_URL=https://your-domain.example
NEXTAUTH_SECRET=replace-with-a-random-secret

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

INTERNAL_PROXY_SHARED_SECRET=replace-with-a-random-secret
ADMIN_EMAIL=admin@example.com

ALLOWED_ORIGINS=https://your-domain.example
```

If you deploy through Docker Hub, also set:

```env
BACKEND_IMAGE=yourdockerhubuser/mathbott-backend:latest
FRONTEND_IMAGE=yourdockerhubuser/mathbott-frontend:latest
```

## Recommended Production Model

If the VPS already runs `nginx` for other projects, use:

- `docker-compose.prod.nginx.yml` if the server builds images locally
- `docker-compose.prod.nginx.hub.yml` if the server pulls images from Docker Hub

In both cases:

- `frontend` binds only to `127.0.0.1:${FRONTEND_BIND_PORT}`
- `backend` stays private inside the Docker network
- public `80/443` remain owned by the existing `nginx`

## Production Behind Existing nginx (Build on VPS)

Run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.nginx.yml up -d --build
```

Check:

```bash
docker compose --env-file .env.production -f docker-compose.prod.nginx.yml ps
docker compose --env-file .env.production -f docker-compose.prod.nginx.yml logs -f frontend backend
```

## Production Behind Existing nginx (Docker Hub)

Run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml pull
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml up -d
```

Update later:

```bash
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml pull
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml up -d
```

## Docker Hub Release Flow

A GitHub Actions workflow is included:

- `.github/workflows/docker-hub.yml`

It builds and pushes:

- `DOCKERHUB_USERNAME/mathbott-backend:latest`
- `DOCKERHUB_USERNAME/mathbott-backend:sha-<commit>`
- `DOCKERHUB_USERNAME/mathbott-frontend:latest`
- `DOCKERHUB_USERNAME/mathbott-frontend:sha-<commit>`

Required GitHub repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## nginx Configuration

Templates are included here:

- `deploy/nginx/mathbot.conf.example`
- `deploy/nginx/mathbot.92-38-48-166.sslip.io.conf`

The nginx site should:

- use a unique `server_name`
- terminate TLS
- proxy requests to `http://127.0.0.1:3001`

After installing the config:

```bash
nginx -t
systemctl reload nginx
```

## Temporary Domain with sslip.io

For a temporary domain without buying a real domain, use a hostname with the server IP embedded.

Example:

```text
mathbot.92-38-48-166.sslip.io
```

This works because `sslip.io` resolves hostnames that contain an IP address.

## Google OAuth

For Google login to work in production, add the exact production domain to Google Cloud Console.

Example for the current temporary domain:

- Authorized JavaScript origin:
  - `https://mathbot.92-38-48-166.sslip.io`
- Authorized redirect URI:
  - `https://mathbot.92-38-48-166.sslip.io/api/auth/callback/google`

## Data Persistence

Production volumes:

- `mathbot_db` stores the SQLite database
- `mathbot_images` stores uploaded images

Do not mount source directories in production.

## Health Checks

Backend health endpoint:

```text
/api/health
```

Quick local check:

```bash
curl http://localhost:8000/api/health
```

Behind nginx:

```bash
curl -I https://your-domain.example
```

## Testing

Backend:

```bash
cd bot
python -m pytest tests
```

Frontend:

```bash
cd web
npm test
```

Lint frontend:

```bash
cd web
npm run lint
```

## Security Notes

- Do not commit `.env.production`
- Do not commit `bot/.env.local`
- Do not commit `web/.env.local`
- Do not expose backend port `8000` publicly in production
- If a secret was pasted into chat, logs, or screenshots, rotate it before real deployment

Secrets that should be rotated if exposed:

- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `INTERNAL_PROXY_SHARED_SECRET`
- `ALERT_TELEGRAM_BOT_TOKEN`

## Common Deployment Sequence

For a clean VPS deployment:

1. Clone the repository
2. Create `.env.production`
3. Install nginx config
4. Issue TLS certificate
5. Start Docker Compose
6. Verify `https://<domain>`
7. Verify Google login
8. Verify admin access

## License

Add your preferred license to this repository.
