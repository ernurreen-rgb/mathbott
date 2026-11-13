# QazMath (`CursorMathbot`)

QazMath is a full-stack mathematics learning, practice, and assessment platform built with a **Next.js 15 (React 18, TypeScript)** web frontend and a **FastAPI (Python 3.11+)** backend. It provides a centralized LaTeX/MathLive task bank, trial tests organized in nested folders, live classroom quizzes (teacher-paced and self-paced), curriculum modules and lessons with a mistake review on number-only twin tasks (optionally drafted by an AI provider) and teacher-facing mistake analytics, computer-algebra answer equivalence checking, social friend/invite workflows, and a role-based administrative workspace.

---

## Documentation Map

All project documentation is organized under [`docs/`](docs/) and [`deploy/`](deploy/):

### Architecture
- **[System Overview](docs/architecture/system-overview.md)** — High-level topology, trust boundaries, runtime modes (local/VPS vs. Vercel + Neon serverless), dual realtime transport (WebSockets vs. HTTP polling), and observability.
- **[Module Structure](docs/architecture/module-structure.md)** — Directory layout and module-by-module responsibilities across `bot/`, `web/`, `deploy/`, and `.github/workflows/`.
- **[Data Flow](docs/architecture/data-flow.md)** — Request signing (`HMAC-SHA256` V2), RBAC resolution, task bank & placement lifecycle, mathematical answer grading pipeline, live quiz state machine, and the trial test draft and submit flow.

### Development & Operations
- **[Local Setup Guide](docs/development/setup.md)** — Prerequisites, environment variables (`bot/.env.example`, `web/.env.example`), local installation, bank preview fixture, and Docker builds.
- **[Development Workflow](docs/development/development-workflow.md)** — Linting, typechecking, build gates, PostgreSQL migrations, backend tests, backup/restore drills, and QA scripts.
- **[Vercel + Neon Production Deployment](deploy/NEON_VERCEL.md)** — Production configuration, schema migrations on Neon, S3 image uploads, quiz entry quotas, and serverless behavior.
- **[PostgreSQL Backup & Restore Drill](deploy/POSTGRES_BACKUP_RESTORE.md)** — Snapshot-consistent `pg_dump` / `pg_restore` verification workflow using `bot/scripts/postgres_backup.py`.

### Reference
- **[API Overview](docs/api/api-overview.md)** — Complete catalog of FastAPI HTTP/WebSocket endpoints and Next.js API routes, proxy authentication contract, rate limits, and RBAC requirements.
- **[Database Schema](docs/database/schema.md)** — Complete reference of all 37 application tables, foreign-key relationships, the PostgreSQL access layer (`bot/storage.py`), and migration history (`0001`–`0009`).
- **[Implemented Features](docs/features/implemented-features.md)** — Verified inventory of active production and administrative features in the current codebase.
- **[Planned, Flagged & Retired Features](docs/features/planned-features.md)** — Feature-flagged UI, logging stubs, deferred roadmap items, and retired legacy tables/features.

---

## Technology Stack

| Layer | Technology | Version / Runtime |
| :--- | :--- | :--- |
| **Frontend** | Next.js (App Router), React, TypeScript, Tailwind CSS | Node.js `24.x` (`.nvmrc`), Next.js `15.5.28`, React `18.3.1`, TypeScript `5.6.3` |
| **Math Rendering & Input** | MathLive (`<math-field>`, `<math-span>`, `<math-div>`) | `mathlive` `^0.110.0` |
| **Worksheet Export** | Client-side raster-to-PDF pipeline | `html-to-image` `1.11.13`, `pdf-lib` `1.17.1` |
| **Authentication** | NextAuth.js (Google OAuth + encrypted JWT) + HMAC Proxy | `next-auth` `^4.24.15` |
| **Backend API** | FastAPI, Uvicorn, Pydantic v2, SlowAPI | Python `3.11`–`3.12` (`pyproject.toml`), FastAPI `0.136.3` |
| **Database** | PostgreSQL 17 (Neon serverless in prod, local server or Docker in development) | `psycopg[binary]` `>=3.2,<4`, checksum-verified SQL migrations |
| **Object Storage** | Local filesystem (`images/`) or S3-compatible bucket | `boto3` `>=1.35,<2`, `aiofiles` `25.1.0` |
| **Observability** | Sentry, in-memory `MetricsCollector`, DB `OpsMonitor` + Telegram alerts | `@sentry/nextjs` `^10.78.0`, `sentry-sdk[fastapi]` `>=2.15.0` |

---

## Quick Start (Local Development)

### 1. Backend (`bot/`)

The backend needs PostgreSQL. With Docker, start one from the repository root (other options, including Windows without Docker, are in the [Local Setup Guide](docs/development/setup.md#11-local-postgresql)):

```powershell
docker compose -f docker-compose.dev.yml up -d
```

```powershell
cd bot
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env.local
# In .env.local: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/qazmath
python main.py
```

The backend listens on `http://localhost:8000`, applies the PostgreSQL migrations (`bot/migrations/postgres/0001`–`0009`) and initial seeds on startup, and refuses to start without a PostgreSQL `DATABASE_URL`.

### 2. Frontend (`web/`)

Select Node.js 24 LTS (matching `.nvmrc`) before installing dependencies:

```powershell
cd web
npm ci
Copy-Item .env.example .env.local
npm run dev
```

The Next.js development server starts on `http://localhost:3000` and proxies browser API calls from `/api/backend/*` to `BACKEND_URL` (`http://localhost:8000`).

> **Note:** In `development` mode, if `INTERNAL_PROXY_SHARED_SECRET` is left empty in both `.env.local` files, the Next.js proxy and FastAPI backend fall back to a shared development secret for local convenience. In `production` (`ENVIRONMENT=production`), a random secret of at least 32 characters is strictly required.

---

## Verification & Quality Checks

The commands below match the checks executed in [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

```powershell
# Backend syntax, lint, tests, and dependency audit (from bot/)
python -m compileall -q .
flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
python -m pip install pytest "httpx==0.28.1"   # test-only tools, as in CI
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"   # disposable server
python -m pytest tests
pip-audit --desc -r requirements.txt

# Frontend lint, typecheck, production build, and audit (from web/)
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

For detailed setup, database migration, and operational instructions, see [`docs/development/setup.md`](docs/development/setup.md) and [`docs/development/development-workflow.md`](docs/development/development-workflow.md).
