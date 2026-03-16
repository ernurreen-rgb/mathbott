# Deploy Guide

This guide is for the production setup with:

- existing `nginx` on the VPS
- Docker Hub images
- local bind only on `127.0.0.1:3001`

Use this stack file:

```bash
docker-compose.prod.nginx.hub.yml
```

## 1. Prerequisites

Server should already have:

- Docker Engine
- Docker Compose plugin
- `nginx`
- TLS certificate tooling (`certbot` or your existing method)

Public ports:

- `80`
- `443`

Do not expose:

- `3001`
- `8000`

## 2. Clone or Update the Repo

Initial clone:

```bash
cd /opt
git clone https://github.com/ernurreen-rgb/mathbott.git
cd /opt/mathbott
```

Update later:

```bash
cd /opt/mathbott
git pull
```

## 3. Create `.env.production`

Do not commit this file.

Create it in the project root:

```bash
cd /opt/mathbott
cp .env.production.example .env.production
```

Set at minimum:

```env
APP_DOMAIN=mathbot.92-38-48-166.sslip.io
FRONTEND_BIND_PORT=3001

BACKEND_IMAGE=<dockerhub-user>/mathbott-backend:latest
FRONTEND_IMAGE=<dockerhub-user>/mathbott-frontend:latest

NEXTAUTH_URL=https://mathbot.92-38-48-166.sslip.io
NEXTAUTH_SECRET=<strong-random-secret>

GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>

INTERNAL_PROXY_SHARED_SECRET=<strong-random-secret>
ADMIN_EMAIL=ernurreen@gmail.com

ALLOWED_ORIGINS=https://mathbot.92-38-48-166.sslip.io
```

Optional:

```env
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

ALERTS_ENABLED=false
ALERT_TELEGRAM_ENABLED=false
ALERT_TELEGRAM_BOT_TOKEN=
ALERT_TELEGRAM_CHAT_ID=
```

If the public reverse proxy is another Docker stack, also set:

```env
PROXY_NETWORK_NAME=common_network
```

## 4. Docker Hub Publishing

Images are built by GitHub Actions:

- workflow: `.github/workflows/docker-hub.yml`

Required GitHub repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Published tags:

- `<dockerhub-user>/mathbott-backend:latest`
- `<dockerhub-user>/mathbott-backend:sha-<commit>`
- `<dockerhub-user>/mathbott-frontend:latest`
- `<dockerhub-user>/mathbott-frontend:sha-<commit>`

If you want a fixed release, pin `BACKEND_IMAGE` and `FRONTEND_IMAGE` to a specific `sha-<commit>` tag instead of `latest`.

## 5. Install nginx Config

Use the provided config:

- `deploy/nginx/mathbot.92-38-48-166.sslip.io.conf`

Install it as a separate site config with its own `server_name`.

It must proxy to:

```text
http://127.0.0.1:3001
```

If the public reverse proxy is another Docker stack instead of host `nginx`, attach Mathbot with:

```bash
docker network create common_network
```

Then proxy to:

```text
http://mathbot-frontend-prod:3000
```

using the shared network from `docker-compose.prod.nginx.proxy-network.yml`.

Test and reload:

```bash
nginx -t
systemctl reload nginx
```

## 6. Issue TLS Certificate

Issue a certificate for:

```text
mathbot.92-38-48-166.sslip.io
```

If you use `certbot`, issue the cert before the final nginx reload, or use your existing certificate flow.

## 7. Start the Stack

Run:

```bash
cd /opt/mathbott
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml pull
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml up -d
```

If the public reverse proxy is another Docker stack, run:

```bash
cd /opt/mathbott
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml -f docker-compose.prod.nginx.proxy-network.yml pull
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml -f docker-compose.prod.nginx.proxy-network.yml up -d
```

Check:

```bash
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml ps
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml logs -f frontend backend
```

If the public reverse proxy is another Docker stack, check with the same override file:

```bash
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml -f docker-compose.prod.nginx.proxy-network.yml ps
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml -f docker-compose.prod.nginx.proxy-network.yml logs -f frontend backend
```

## 8. Update Later

After new code is pushed and new images are published:

```bash
cd /opt/mathbott
git pull
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml pull
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml up -d
```

If the public reverse proxy is another Docker stack, update with:

```bash
cd /opt/mathbott
git pull
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml -f docker-compose.prod.nginx.proxy-network.yml pull
docker compose --env-file .env.production -f docker-compose.prod.nginx.hub.yml -f docker-compose.prod.nginx.proxy-network.yml up -d
```

## 9. Google OAuth

In Google Cloud Console, add:

- Authorized JavaScript origin:
  - `https://mathbot.92-38-48-166.sslip.io`
- Authorized redirect URI:
  - `https://mathbot.92-38-48-166.sslip.io/api/auth/callback/google`

Without this, login will fail.

## 10. Verification

Check the public endpoint:

```bash
curl -I https://mathbot.92-38-48-166.sslip.io
```

Check backend through the app:

```bash
curl https://mathbot.92-38-48-166.sslip.io/api/backend/api/health
```

Expected result:

- frontend responds over HTTPS
- backend health returns `healthy`
- admin login works through Google OAuth

## 11. Security Notes

- Do not commit `.env.production`
- Do not expose backend port `8000`
- Do not expose frontend port `3001` publicly
- Rotate secrets if they were ever pasted into chat, screenshots, or logs
