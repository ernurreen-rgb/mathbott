# Local Development Setup Guide

This guide explains how to configure, run, and debug the QazMath (`CursorMathbot`) backend (`bot/`) and frontend (`web/`) locally.

---

## 1. Prerequisites

| Tool | Version | Source of Truth | Notes |
|---|---|---|---|
| **Node.js** | `24.x` (LTS) | [`.nvmrc`](../../.nvmrc), [`web/package.json`](../../web/package.json), [`web/Dockerfile`](../../web/Dockerfile) | Required for Next.js `15.5.28` and tooling (`engines.node = "24.x"`). |
| **npm** | Bundled with Node 24 | [`web/package-lock.json`](../../web/package-lock.json) | Use `npm ci` for reproducible installs. |
| **Python** | `3.11` or `3.12` | [`bot/Dockerfile`](../../bot/Dockerfile) (`3.11`), [`bot/pyproject.toml`](../../bot/pyproject.toml) (`>=3.11,<3.13`) | Supported across Docker, GitHub Actions CI (`3.11`), and Vercel (`3.12`). |
| **PostgreSQL** | `17` | [`docker-compose.dev.yml`](../../docker-compose.dev.yml), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (`postgres:17`) | Required. PostgreSQL is the only supported database: production runs on Neon, local development and tests on any PostgreSQL 17 server (see section 1.1). |
| **PostgreSQL Client Tools** | `18` (optional) | [`bot/scripts/postgres_backup.py`](../../bot/scripts/postgres_backup.py) | `pg_dump` and `pg_restore` are only needed if running PostgreSQL backup/restore drills locally. |

### 1.1 Local PostgreSQL

The backend refuses to start without a PostgreSQL `DATABASE_URL`. Pick one way to run a local server:

**A. Docker (recommended when Docker is available).** [`docker-compose.dev.yml`](../../docker-compose.dev.yml) starts PostgreSQL 17 on `127.0.0.1:5432` with a persistent volume and an empty `qazmath` database:

```powershell
docker compose -f docker-compose.dev.yml up -d
```

- App: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/qazmath`
- Tests: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`

**B. Windows without Docker.** Either install PostgreSQL 17 with the installer from <https://www.postgresql.org/download/windows/>, or unpack the PostgreSQL 17 "binaries" zip from <https://www.enterprisedb.com/download-postgresql-binaries> (no installation, no Windows service). For the zip, with `pgsql` unpacked to `C:\pgsql`:

```powershell
# Once: create a data directory (trust authentication; the server below listens on 127.0.0.1 only)
C:\pgsql\bin\initdb.exe -D C:\pgdata -U postgres -A trust -E UTF8 --locale=C
# After each reboot: start the server
C:\pgsql\bin\pg_ctl.exe -D C:\pgdata -l C:\pgdata\server.log -o "-c listen_addresses=127.0.0.1" start
# Once: create the development database
C:\pgsql\bin\createdb.exe -h 127.0.0.1 -U postgres qazmath
```

- App: `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/qazmath`
- Tests: `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres`

**C. A Neon development branch.** Point `DATABASE_URL` at a branch created for development, never at the production branch. Keep tests on a local server: they create and drop databases and are slow over the network.

Migrations run automatically on startup (`DATABASE_AUTO_MIGRATE`, default `true` outside Vercel), so an empty database is enough.

> [!NOTE]
> SQLite is no longer supported. An old `bot/mathbot.db` file is not read by anything and stays out of git (`*.db` in [`.gitignore`](../../.gitignore)). The one-off SQLite-to-PostgreSQL importer was removed; it remains in git history (`bot/migrations/sqlite_to_postgres.py` up to commit `bd3bdef`).

---

## 2. Environment Configuration

Copy the example environment files before starting the servers:

```powershell
Copy-Item bot/.env.example bot/.env.local
Copy-Item web/.env.example web/.env.local
```

> [!IMPORTANT]
> `INTERNAL_PROXY_SHARED_SECRET` in `bot/.env.local` and `web/.env.local` **must match**. In `development` mode, leaving both empty falls back to a built-in local development secret (`bot/config.py`). In `production` (`ENVIRONMENT=production`), a random secret of at least 32 characters is strictly required (`validate_configuration` in [`bot/config.py`](../../bot/config.py)).

### 2.1 Backend Environment Variables (`bot/.env.local` / `bot/.env`)

Defined and validated in [`bot/settings.py`](../../bot/settings.py) (`Settings`) and [`bot/config.py`](../../bot/config.py):

| Variable | Default (`Settings`) | Required in Prod? | Description |
|---|---|---|---|
| `ENVIRONMENT` | `development` | Yes (`production`) | Runtime environment (`development`, `production`, `test`). Controls strict startup validation (`validate_configuration`). |
| `LOG_LEVEL` | `INFO` | No | Python logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `APP_VERSION` | `1.0.0` | No | Version string reported by health/telemetry endpoints. |
| `PORT` | `8000` | No | TCP port for Uvicorn (`bot/main.py`). |
| `DATABASE_URL` | `""` | Yes (everywhere) | PostgreSQL connection URL (`postgresql://...`; the pooled URL on Neon). Required: startup fails with a clear error when it is empty or not a PostgreSQL URL ([`bot/storage.py`](../../bot/storage.py), [`bot/config.py`](../../bot/config.py)). |
| `DATABASE_MIGRATION_URL` | `""` | Recommended on Neon | Direct (unpooled) PostgreSQL URL for schema migrations at startup and in [`bot/scripts/migrate_to_neon.py`](../../bot/scripts/migrate_to_neon.py); falls back to `DATABASE_URL`. |
| `DATABASE_AUTO_MIGRATE` | `None` (`VERCEL != "1"`) | Set `false` on Vercel | Controls whether schema migrations run automatically on process startup. |
| `BACKGROUND_TASKS_ENABLED` | `None` (`VERCEL != "1"`) | Set `false` on Vercel | Controls whether in-process background `asyncio` loops (maintenance, presence cleanup, ops monitor) run. |
| `CRON_SECRET` | `""` | Yes (on Vercel) | Bearer token required by `GET /api/maintenance` when triggered by Vercel Cron. |
| `INTERNAL_PROXY_SHARED_SECRET` | `""` | Yes (`>= 32` chars) | Shared HMAC-SHA256 secret used to verify `X-Proxy-Request-Signature-V2` from the Next.js proxy and sign WebSocket/import tokens. |
| `ADMIN_SECRET` | `change-me-in-production` | Legacy only | Legacy admin bootstrap secret (only active if `ALLOW_LEGACY_ADMIN_BOOTSTRAP=true`). |
| `ADMIN_EMAIL` | `None` | Recommended | Bootstrap super-admin email. Automatically promoted to `super_admin` (`is_admin = 1`). |
| `IMPORT_PREVIEW_TOKEN_SECRET` | `None` | Optional | Optional dedicated secret for `/api/admin/bank/tasks/import` preview tokens (`bot/routes/admin/import_tokens.py`); falls back to `INTERNAL_PROXY_SHARED_SECRET`. |
| `ALLOWED_ORIGINS` | `""` (localhost in dev) | Yes (HTTPS URL) | Comma-separated CORS origins allowed to call FastAPI. |
| `CORS_ALLOW_ALL` | `false` | No (dev only) | Allows `*` CORS origins in `development` only. |
| `CSRF_ENABLED` | `false` | Optional | Enables Origin/Referer CSRF check middleware (`bot/middleware/csrf.py`). |
| `IMAGE_STORAGE_BACKEND` | `local` | Yes (`s3` on Vercel) | Image storage backend: `local` (reads/writes `images/`) or `s3` (private S3-compatible bucket). |
| `S3_BUCKET` | `""` | When `s3` | S3 bucket name (`mathbot-images`). |
| `S3_ENDPOINT_URL` | `""` | When `s3` | S3-compatible endpoint URL (e.g., Neon Object Storage or Cloudflare R2). |
| `S3_REGION` | `auto` | When `s3` | S3 region name. |
| `S3_ACCESS_KEY_ID` | `""` | When `s3` | S3 access key ID. |
| `S3_SECRET_ACCESS_KEY` | `""` | When `s3` | S3 secret access key. |
| `IMAGE_UPLOAD_MAX_BYTES` | `5242880` (5 MiB) | Recommended (`4194304`) | Maximum uploaded image size in bytes. |
| `BANK_TRASH_RETENTION_DAYS` | `30` | No | Days before soft-deleted bank tasks are eligible for scheduled purge. |
| `QUIZ_ENTRY_REQUESTS_PER_MINUTE` | `1200` | No | Per-network 60s request budget for quiz PIN lookup/join (`1`–`100000`). |
| `QUIZ_ENTRY_DISTINCT_PINS_PER_MINUTE` | `30` | No | Per-network 60s distinct PIN budget (`1`–`1000`). |
| `QUIZ_ENTRY_NEW_PARTICIPANTS_PER_MINUTE` | `300` | No | Per-network 60s new participant creation budget (`1`–`10000`). |
| `QUIZ_MAX_PARTICIPANTS` | `500` | No | Maximum participants per live quiz session (`1`–`10000`). |
| `SENTRY_DSN` | `""` | Optional | Sentry DSN for backend error/performance monitoring (`bot/utils/sentry.py`). |
| `SENTRY_ENVIRONMENT` / `SENTRY_RELEASE` | `None` | Optional | Optional Sentry environment and release tags. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | No | Sentry trace sample rate (`0.0`–`1.0`). |
| `ALERTS_ENABLED` | `false` | Optional | Enables operational incident alerts (`bot/utils/alerts.py`). |
| `ALERT_TELEGRAM_ENABLED` | `false` | Optional | Enables Telegram delivery for operational alerts. |
| `ALERT_TELEGRAM_BOT_TOKEN` | `""` | When Telegram alerts on | Telegram Bot API token for ops alerts. |
| `ALERT_TELEGRAM_CHAT_ID` | `""` | When Telegram alerts on | Target Telegram chat ID for ops alerts. |
| `AI_TWIN_BASE_URL` | `""` | Optional | Base URL of an OpenAI-compatible Chat Completions API (e.g. `https://api.openai.com/v1`) for AI twin drafts. |
| `AI_TWIN_API_KEY` | `""` | With AI drafts | API key of that provider; stays on the server. |
| `AI_TWIN_MODEL` | `""` | With AI drafts | Model id with JSON mode. AI drafts stay off until all three `AI_TWIN_*` values are set. |
| `AI_TWIN_TIMEOUT_SECONDS` | `45` | Optional | Provider request timeout (`5`–`55`), kept under the 60-second Vercel function limit. |
| `OPS_HEALTH_SAMPLE_RETENTION_DAYS` | `30` | No | Retention window for `ops_health_samples`. |
| `OPS_INCIDENT_RETENTION_DAYS` | `365` | No | Retention window for resolved rows in `ops_incidents`. |

### 2.2 Frontend Environment Variables (`web/.env.local`)

Inspected from [`web/.env.example`](../../web/.env.example), [`web/app/api/auth/[...nextauth]/route.ts`](../../web/app/api/auth/[...nextauth]/route.ts), [`web/app/api/backend/[...path]/route.ts`](../../web/app/api/backend/[...path]/route.ts), and [`web/lib/websocket-url.ts`](../../web/lib/websocket-url.ts):

| Variable | Example / Default | Required? | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `/api/backend` | Yes | Browser API base path; routes all browser HTTP calls through the same-origin Next.js proxy. |
| `BACKEND_URL` | `http://localhost:8000` | Yes | Upstream FastAPI base URL (without `/api`) used by the Next.js proxy (`web/app/api/backend/[...path]/route.ts`). |
| `NEXTAUTH_URL` | `http://localhost:3000` | Yes | Canonical URL of the Next.js app for NextAuth callbacks. |
| `NEXTAUTH_SECRET` | `<random 32+ char string>` | Yes | Secret used by NextAuth (`^4.24.15`) to encrypt session JWT cookies. |
| `GOOGLE_CLIENT_ID` | `<google-oauth-client-id>` | Yes (for OAuth sign-in) | Google OAuth 2.0 Client ID. |
| `GOOGLE_CLIENT_SECRET` | `<google-oauth-secret>` | Yes (for OAuth sign-in) | Google OAuth 2.0 Client Secret. |
| `INTERNAL_PROXY_SHARED_SECRET` | `<matches backend>` | Yes (in prod) | Shared HMAC-SHA256 secret used to sign `X-Proxy-Request-Signature-V2` headers sent to FastAPI. |
| `TRUSTED_CLIENT_IP_HEADER` | `""` (`x-real-ip` on VPS) | Self-hosted only | Header name trusted for deriving quiz entry network budgets when running behind a self-hosted reverse proxy (`Nginx`/`Caddy`). Vercel uses `x-vercel-forwarded-for` automatically. |
| `NEXT_PUBLIC_REALTIME_TRANSPORT` | `websocket` (local) / `polling` (Vercel) | No | Selects `websocket` or HTTP `polling` for live quizzes and presence ([`web/lib/websocket-url.ts`](../../web/lib/websocket-url.ts)). |
| `NEXT_PUBLIC_WS_API_URL` | `""` | Optional | Optional explicit WebSocket base URL when `NEXT_PUBLIC_REALTIME_TRANSPORT=websocket`. |
| `CSP_CONNECT_SRC` | `""` | Optional | Additional origins appended to Content-Security-Policy `connect-src` in [`web/next.config.js`](../../web/next.config.js). |
| `NEXT_PUBLIC_MODULES_UI_ENABLED` | `true` | Optional | Feature flag in [`web/app/modules/page.tsx`](../../web/app/modules/page.tsx). Enabled by default (`!== "false"`); set to `"false"` to hide the `/modules` map behind a maintenance banner. |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | `""` | Optional | Sentry DSN for client, edge, and server error reporting. |

---

## 3. Running the Application Locally

### 3.1 Start the Backend (`bot/`)

From the repository root:

```powershell
cd bot
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python main.py
```

Set `DATABASE_URL` in `bot/.env.local` first (section 1.1).

On startup (`lifespan` in [`bot/main.py`](../../bot/main.py)):
1. [`bot/instrument.py`](../../bot/instrument.py) loads `bot/.env.local` and `bot/.env`.
2. `validate_configuration()` validates runtime settings, including a PostgreSQL `DATABASE_URL`.
3. When `migrate_on_startup` is true (default outside Vercel), `Database.init()` applies the PostgreSQL migrations in [`bot/migrations/postgres/`](../../bot/migrations/postgres/) (`0001`–`0009`, checksum-verified by [`bot/migrations/postgres_runner.py`](../../bot/migrations/postgres_runner.py)) and runs the idempotent seeds in [`bot/migrations/seeds.py`](../../bot/migrations/seeds.py).
4. Verify health at `http://localhost:8000/api/health`.

### 3.2 Start the Frontend (`web/`)

In a second terminal, from the repository root:

```powershell
cd web
npm ci
npm run dev
```

Open `http://localhost:3000`.

### 3.3 Isolated Bank Workspace Preview (`preview_bank_workspace.py`)

To inspect or test the `/admin/bank` catalog and full-width task workspace against a disposable seeded fixture database without touching your development database. The fixture gets its own database on the `TEST_DATABASE_URL` server, dropped again when you stop the script with Ctrl+C:

```powershell
# Terminal 1: Starts isolated fixture backend on http://127.0.0.1:8100
cd bot
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
.\venv\Scripts\python.exe scripts/preview_bank_workspace.py
```

You can also run the automated Playwright CLI browser verification scripts in [`web/tools/preview-bank-browser.js`](../../web/tools/preview-bank-browser.js), [`web/tools/check-bank-workspace.js`](../../web/tools/check-bank-workspace.js), and [`web/tools/check-bank-mobile.js`](../../web/tools/check-bank-mobile.js).

### 3.4 Backend Tests (`bot/tests/`)

The tests run against a real PostgreSQL server. `TEST_DATABASE_URL` points at any database on a server you can throw away; [`bot/tests/postgres_test_db.py`](../../bot/tests/postgres_test_db.py) creates a database with a random name there for each test (or test class) and drops it afterwards. The variable is read from the shell, never from `bot/.env.local`, so tests cannot reach your development or production database by accident.

```powershell
cd bot
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
python -m pytest tests
```

Without `TEST_DATABASE_URL` the database tests are skipped locally; in CI (`CI` is set) a missing server is an error. CI runs the same command against a `postgres:17` service container.

---

## 4. Docker Builds

Both services include multi-stage Dockerfiles ([`bot/Dockerfile`](../../bot/Dockerfile) and [`web/Dockerfile`](../../web/Dockerfile)):

```powershell
# Build backend image (Python 3.11-slim + PostgreSQL 18 client tools)
docker build -t mathbot-backend:local ./bot

# Build frontend image (Node 24-alpine standalone Next.js build)
docker build --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN -t mathbot-web:local ./web
```

> [!NOTE]
> [`web/Dockerfile`](../../web/Dockerfile) receives `SENTRY_AUTH_TOKEN` via a BuildKit secret mount (`--secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN`) rather than a `docker build --build-arg` so the token never persists in image layer metadata. The secret is optional when source-map uploads are not needed.
