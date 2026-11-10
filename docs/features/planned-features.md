# Feature-Flagged, Planned & Retired Features

This document distinguishes between features that are **feature-flagged**, **planned / deferred**, **retired / deprecated**, or **unverifiable from source code (`UNKNOWN / REQUIRES VERIFICATION`)**.

---

## 1. Feature-Flagged Functionality

### 1.1 Interactive Student Modules Map (`/modules`)
- **Location**: [`web/app/modules/page.tsx`](../../web/app/modules/page.tsx) (line 15), [`web/Dockerfile`](../../web/Dockerfile) (line 20).
- **Current State**:
  - Both the backend curriculum APIs (`/api/modules/map`, `/api/modules/{module_id}`, `/api/lessons/{lesson_id}`, `/api/task/check`) and the frontend map UI in `web/app/modules/page.tsx` are implemented and enabled by default (`process.env.NEXT_PUBLIC_MODULES_UI_ENABLED !== "false"` in `web/app/modules/page.tsx` and `ARG NEXT_PUBLIC_MODULES_UI_ENABLED=true` in `web/Dockerfile`).
  - If `NEXT_PUBLIC_MODULES_UI_ENABLED` is explicitly set to `"false"`, `/modules` renders a blurred preview covered by a banner (*"Бөлім уақытша жабық / Модульдер беті қазір дайындалып жатыр"*).

---

## 2. Planned / Deferred Functionality (Not Implemented)

### 2.1 Student-Facing Topic Mastery (`D05`, partly superseded)
- **Status**: The mistake-review queue and teacher-facing analytics by topic and student are now implemented (see [Implemented Features §9](implemented-features.md#9-mistake-review-twin-tasks-ai-drafts--mistake-analytics)). A **student-facing** topic mastery view (students seeing their own weak topics) is still **not implemented**.

### 2.2 Bank Task Editorial Lifecycle Statuses (`Draft / In Review / Ready`)
- **Status**: Explicitly excluded from the current bank workspace implementation. Bank tasks have active (`deleted_at IS NULL`) vs. trash (`deleted_at IS NOT NULL`) states and version history (`bank_task_versions`), but no editorial workflow status column. The only draft state is on twin links (`bank_task_twins.status = 'draft'` for AI twin drafts awaiting approval).

### 2.3 Not Yet Built for Mistake Review
- **CSV export of mistake analytics**: deliberately left out of `/admin/mistakes`.
- **AI drafts for tasks with images**: refused by design; such twins are created manually.
- **Provider-specific AI clients**: AI twin drafts use the OpenAI-compatible Chat Completions format only; no native SDK for any provider is bundled.

---

## 3. Retired & Deprecated Functionality

The following features existed in earlier schema revisions and were intentionally retired:

| Retired Feature | Migration / Commit | Current State in Codebase |
|---|---|---|
| **Competitive Ratings, Leagues & Bots** | Alembic [`0005_remove_competitive_features.py`](../../bot/migrations/versions/0005_remove_competitive_features.py) | Retired tables/columns archived into `mathbot_legacy_archive` when migrating with `--archive-legacy`. No runtime routes or UI remain. |
| **Interactive Factor Grid Task Type (`factor_grid`)** | Alembic [`0006_remove_factor_grid_tasks.py`](../../bot/migrations/versions/0006_remove_factor_grid_tasks.py) | Converted to standard `input` tasks (`a,b,c,d`). Runtime normalization fallback remains in [`bot/repositories/task_repository.py`](../../bot/repositories/task_repository.py) and [`bot/repositories/trial_test_repository.py`](../../bot/repositories/trial_test_repository.py). |
| **Learning Points (`total_points`, `points_awarded`)** | Alembic [`0010_remove_learning_points.py`](../../bot/migrations/versions/0010_remove_learning_points.py) / PG [`0003_remove_learning_points.sql`](../../bot/migrations/postgres/0003_remove_learning_points.sql) | Renamed `user_task_rewards` -> `user_task_completions` and dropped `points_awarded`, `difficulty`, and `users.total_points`. |
| **Admin Onboarding Survey Breakdown** | Commit `e60e98f` | Removed from `/api/admin/statistics` and `/admin/statistics` UI, while `user_onboarding` remains active for student onboarding (`/api/user/onboarding`). |
| **Unused Summary Table (`user_progress_summary`)** | [`0001_initial.sql`](../../bot/migrations/postgres/0001_initial.sql) | Present in the database schema for migration parity, but no repository reads or writes to `user_progress_summary` (progress is computed directly from `user_progress`). |

---

## 4. Areas Marked `UNKNOWN` / `REQUIRES VERIFICATION`

The following external infrastructure states cannot be verified from repository source code alone:
1. **Live Cloud Environment Variables & Secrets (`REQUIRES VERIFICATION`)**: Actual configured secret values in the Vercel project dashboards (`qazmath` and `qazmath-api`), Neon database console (`mathbot-neon`), and S3 storage bucket (`mathbot-images`).
2. **External Automated Backup Scheduling (`UNKNOWN`)**: While [`bot/scripts/postgres_backup.py`](../../bot/scripts/postgres_backup.py) provides verified CLI commands (`backup` and `restore`), no GitHub Actions workflow or Vercel Cron in the repository invokes `postgres_backup.py` on a schedule. Off-site backup scheduling requires external operational verification.
3. **Self-Hosted VPS Compose Files (`UNKNOWN`)**: [`deploy/Caddyfile`](../../deploy/Caddyfile), [`deploy/Caddyfile.backend.example`](../../deploy/Caddyfile.backend.example), [`deploy/nginx/mathbot.conf.example`](../../deploy/nginx/mathbot.conf.example), and [`deploy/docker-compose.backend.override.yml`](../../deploy/docker-compose.backend.override.yml) provide reverse-proxy and container override templates, while primary production runs serverless on Vercel + Neon.
