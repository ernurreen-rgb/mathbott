# Development Workflow & Operations Guide

This document covers the actual build scripts, CI/CD pipelines, database migration workflows, CLI operational scripts, and testing practices in the repository.

---

## 1. Frontend Scripts (`web/package.json`)

All frontend commands are run from [`web/`](../../web/package.json) using Node.js `24.x` (`.nvmrc`):

| Command | Script Definition | Purpose |
|---|---|---|
| `npm run dev` | `next dev --turbopack -H 0.0.0.0` | Starts the local Next.js 15 development server with Turbopack on port `3000`. |
| `npm run dev:webpack` | `next dev -H 0.0.0.0` | Starts the local Next.js development server using Webpack. |
| `npm run build` | `next build` | Builds the production Next.js bundle. |
| `npm run start` | `next start -H 0.0.0.0` | Starts the production Next.js server. |
| `npm run lint` | `eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0` | Runs ESLint 8 with zero warnings allowed. |
| `npm run typecheck` | `tsc --noEmit` | Runs TypeScript 5 static type checking without emitting files. |

### Dependency Override (`minimatch-compat`)
[`web/package.json`](../../web/package.json) pins `"minimatch": "file:tools/minimatch-compat"` in `devDependencies` and `overrides` (`"minimatch@<9": "$minimatch"`). As documented in [`web/tools/minimatch-compat/README.md`](../../web/tools/minimatch-compat/README.md), this local compatibility shim bridges `minimatch@11` with ESLint 8 transitive packages (`@eslint/eslintrc`, `eslint-plugin-import`, `@typescript-eslint/typescript-estree`) while eliminating legacy ReDoS advisories in `minimatch < 10.2.3`. Do not remove this override while using ESLint 8.

---

## 2. Testing & Verification

### Current Test Suite Status
> [!IMPORTANT]
> On `2026-11-05` (commit `b201538`), legacy backend `pytest` suites (51 test files), Jest unit tests (`web/jest.config.js`), and Playwright E2E suites (`web/e2e/*`) were removed from the repository. On `2026-11-08` (commit `d1d83b3`), targeted tests and browser verification scripts for the Bank Workspace were introduced; tests for mistake review, AI twin drafts and mistake analytics followed on `2026-11-10`.

Currently present verification assets in the repository:

1. **Backend Unit/Integration Tests (`pytest`)**, against real PostgreSQL. Set `TEST_DATABASE_URL` in the shell to any database on a disposable server (for example `postgresql://postgres:postgres@localhost:5432/postgres`). [`bot/tests/postgres_test_db.py`](../../bot/tests/postgres_test_db.py) creates a database with a random name there for every test (`PostgresTestCase`, with the production connection pool) or test class, runs the migrations, and drops it afterwards; `seed()` moves id sequences past rows inserted with explicit ids. Without the variable the database tests are skipped locally; in CI (`CI` set) a missing server is an error. CI provides a PostgreSQL 17 service.
   - [`bot/tests/test_bank_catalog.py`](../../bot/tests/test_bank_catalog.py): Verifies `/api/admin/bank/catalog` and `/api/admin/bank/tasks` across a 10,000-task temporary database (pagination, ID/text search, `ANY`/`ALL` topic matching, usage filters, counts, sorting, auth, and clearing stale `options`/`subquestions` on question-type change).
   - [`bot/tests/test_module_review.py`](../../bot/tests/test_module_review.py): First-attempt mistakes, twin order and the original-task fallback, answers bound to the served task, unchanged progress, twins hidden from library and quality reports, twin rules, and route auth without leaking answers.
   - [`bot/tests/test_ai_twins.py`](../../bot/tests/test_ai_twins.py): AI drafts with the provider replaced by a fake (drafts hidden until approved, bank payload rules, independent re-solve check, refusals, output parsing) and one request against a local Chat Completions server; no network calls.
   - [`bot/tests/test_mistake_analytics.py`](../../bot/tests/test_mistake_analytics.py): Summary, task, topic and student aggregation, period and module filters, and e-mail visibility by role.
   - [`bot/tests/test_lesson_gate.py`](../../bot/tests/test_lesson_gate.py): The next lesson waits for the review of completed mini-lessons (across sections, only the next lesson), started lessons stay open, and module, lesson and answer routes enforce it for students but not admins.
   - [`bot/tests/test_admin_statistics.py`](../../bot/tests/test_admin_statistics.py): The statistics workspace: period comparison, zero-filled series, local-day boundaries by time zone, the admin filter, students, tasks, modules, trial tests with per-question accuracy, quizzes, malformed legacy timestamps, pooled connections with a row factory, and route auth with e-mail visibility by role. Its period and bucket unit tests also run without a database.
   - Run from `bot/` (`httpx` is a test-only dependency, not in `requirements.txt`):
     ```powershell
     python -m pip install pytest "httpx==0.28.1"
     $env:TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres"
     python -m pytest tests
     ```
2. **Backend Syntax & Static Error Check**:
   - Executed in CI ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)):
     ```powershell
     cd bot
     python -m compileall -q .
     flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
     ```
3. **Bank Workspace Browser Verification Scripts (`web/tools/`)**:
   - [`bot/scripts/preview_bank_workspace.py`](../../bot/scripts/preview_bank_workspace.py): Launches an isolated FastAPI server on `127.0.0.1:8100` backed by a disposable seeded database on the `TEST_DATABASE_URL` server, dropped when the script stops.
   - [`web/tools/preview-bank-browser.js`](../../web/tools/preview-bank-browser.js): Configures a mocked NextAuth browser session against the disposable preview server.
   - [`web/tools/check-bank-workspace.js`](../../web/tools/check-bank-workspace.js): Runs 13 desktop (`1440px`) checks covering catalog counts, search/filter persistence, task editing, version conflicts, deep links, MathLive creation, and multi-page PDF selection/export.
   - [`web/tools/check-bank-mobile.js`](../../web/tools/check-bank-mobile.js): Runs 6 mobile (`390px`) layout and navigation checks.

---

## 3. Continuous Integration & Deployment Workflows (`.github/workflows/`)

### 3.1 Main CI Gate ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml))
Triggered on `push` and `pull_request` to `main` or `develop`:
1. **`backend-checks`** (Python `3.11`, with a `postgres:17` service exposed to the tests as `TEST_DATABASE_URL`):
   - Installs `bot/requirements.txt`, `flake8`, `pip-audit`, `pytest`, and `httpx` (test-only).
   - Runs `python -m compileall -q .`, `flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics`, `python -m pytest tests`, and `pip-audit --desc -r requirements.txt`.
2. **`frontend-checks`** (Node.js `24` from `.nvmrc`):
   - Runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm audit --audit-level=moderate` in `web/`.

### 3.2 Docker Image Build, Trivy Scan & Docker Hub Push ([`.github/workflows/docker-hub.yml`](../../.github/workflows/docker-hub.yml))
Triggered on push to `main`, Git tags `v*`, or `workflow_dispatch`:
1. Runs `backend-syntax` and `frontend-check` gates.
2. Builds `./bot` and `./web` Docker images, scans both with **Aqua Trivy** (`aquasecurity/trivy-action`, failing on `CRITICAL,HIGH` vulnerabilities with `exit-code: 1`), and pushes verified images to Docker Hub (`<DOCKERHUB_USERNAME>/mathbot-backend` and `<DOCKERHUB_USERNAME>/mathbot-web`).

### 3.3 Weekly Security Audit ([`.github/workflows/security-audit.yml`](../../.github/workflows/security-audit.yml))
Triggered weekly (`0 6 * * 1` — Mondays at 06:00 UTC) or via `workflow_dispatch`:
- Runs `pip-audit` on `bot/requirements.txt` and `npm audit --audit-level=moderate` on `web/`.

---

## 4. Database Migrations Workflow

PostgreSQL is the only database. Its schema lives in numbered SQL files: [`bot/migrations/postgres/0001_initial.sql`](../../bot/migrations/postgres/0001_initial.sql) through [`0009_ai_twin_checks.sql`](../../bot/migrations/postgres/0009_ai_twin_checks.sql), applied in order by [`bot/migrations/postgres_runner.py`](../../bot/migrations/postgres_runner.py) and recorded in `mathbot_schema_migrations` with SHA-256 checksums. The SQLite Alembic track (`bot/migrations/versions/`) was removed on `2026-11-12`.

### Rules When Modifying the Database Schema
1. **Add the next numbered `.sql` file** in `bot/migrations/postgres/` for every schema change. It runs in one transaction with the other pending migrations at startup or through `python scripts/migrate_to_neon.py`.
2. **Never edit an already-applied PostgreSQL `.sql` migration file**: [`bot/migrations/postgres_runner.py`](../../bot/migrations/postgres_runner.py) verifies the SHA-256 checksum of every applied migration in `mathbot_schema_migrations` and aborts on mismatch.
3. **Write PostgreSQL SQL.** Repositories keep `?` placeholders (translated to `%s` in [`bot/storage.py`](../../bot/storage.py)). Dates are UTC text `YYYY-MM-DD HH24:MI:SS`: write `mathbot_datetime('now')` instead of `CURRENT_TIMESTAMP`, and use the `mathbot_datetime/date/strftime/julianday` functions from `0002_sql_functions.sql` for date arithmetic on those columns.

---

## 5. Operational CLI Scripts (`bot/scripts/`)

All operational scripts are run from `bot/`:

| Script | Command Example | Purpose |
|---|---|---|
| [`migrate_to_neon.py`](../../bot/scripts/migrate_to_neon.py) | `python scripts/migrate_to_neon.py` | Applies the PostgreSQL migrations (`0001`–`0009`) and startup seeds via `DATABASE_MIGRATION_URL` (falls back to `DATABASE_URL`). `--schema-only` is still accepted and does the same. See [`deploy/NEON_VERCEL.md`](../../deploy/NEON_VERCEL.md). |
| [`postgres_backup.py`](../../bot/scripts/postgres_backup.py) | `python scripts/postgres_backup.py backup --output C:\private-backups\snap`<br>`python scripts/postgres_backup.py restore --backup C:\private-backups\snap`<br>`python scripts/postgres_backup.py restore --backup C:\private-backups\snap --apply` | Creates a `REPEATABLE READ, READ ONLY` snapshot-consistent `pg_dump` (`database.dump`) + `manifest.json` (with SHA-256 digests and all 7 migration checksums) and verifies restoration into an isolated `mathbot_restore_*` database. See [`deploy/POSTGRES_BACKUP_RESTORE.md`](../../deploy/POSTGRES_BACKUP_RESTORE.md). |
| [`upload_images.py`](../../bot/scripts/upload_images.py) | `python scripts/upload_images.py --source ../images`<br>`python scripts/upload_images.py --source ../images --apply` | Uploads local task images from `images/` to the configured S3 bucket (`S3_BUCKET`) without overwriting mismatched content. |
| [`preview_bank_workspace.py`](../../bot/scripts/preview_bank_workspace.py) | `python scripts/preview_bank_workspace.py` | Starts an isolated seeded FastAPI fixture server on `127.0.0.1:8100` for testing `/admin/bank`, on its own database on the `TEST_DATABASE_URL` server. |
