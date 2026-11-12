# Module Structure

This document maps the directory layout of the repository and the responsibilities of each module, verified against the current codebase.

---

## 1. Repository Root Layout

```text
CursorMathbot/
├── .github/workflows/       # GitHub Actions CI, Docker Hub publish, and weekly security audit
├── bot/                     # FastAPI backend application, database migrations, and CLI scripts
├── deploy/                  # Deployment runbooks (Vercel+Neon, PG backup) and Nginx/Caddy configs
├── docs/                    # Architecture, setup, API, database, feature, and release documentation
├── images/                  # Local development image storage directory (when IMAGE_STORAGE_BACKEND=local)
├── web/                     # Next.js 15 App Router frontend application
├── .gitignore               # Git ignore rules
├── .nvmrc                   # Node.js major version pin (24)
└── README.md                # Project entry point and documentation index
```

---

## 2. Backend (`bot/`)

### 2.1 Application Entry Points & Core Wiring

| File | Responsibility |
| :--- | :--- |
| [`bot/main.py`](../../bot/main.py) | Process entry point (`main:app`). Initializes `instrument.py`, validates config, instantiates `Database`, and creates the FastAPI `app`. |
| [`bot/instrument.py`](../../bot/instrument.py) | Loads `.env.local` / `.env`, configures structured logging (`logging_config.py`), and initializes Sentry (`utils/sentry.py`). |
| [`bot/app.py`](../../bot/app.py) | FastAPI application factory (`create_app`), lifespan context manager (migrations, seeds, background tasks), middleware registration, and route mounting. |
| [`bot/settings.py`](../../bot/settings.py) | `pydantic-settings` `Settings` model and `get_settings()` accessor for all runtime environment variables. |
| [`bot/config.py`](../../bot/config.py) | Environment file loader, CORS origin helper, and startup configuration validator (`validate_configuration`). |
| [`bot/dependencies.py`](../../bot/dependencies.py) | FastAPI `Depends` providers for database access (`get_db`), internal proxy identity (`require_internal_identity`), and admin RBAC (`require_admin`, `require_admin_any_admin`, `require_admin_review_manage`, `require_admin_super_critical`). |
| [`bot/database.py`](../../bot/database.py) | `Database` facade composing all domain repositories and managing the shared `ConnectionPool`. |
| [`bot/storage.py`](../../bot/storage.py) | Unified async database driver supporting both SQLite (`aiosqlite`) and PostgreSQL (`psycopg` via `PostgresConnection` SQL translation). |
| [`bot/vercel.json`](../../bot/vercel.json) | Vercel function configuration (`main.py`, `maxDuration: 60`, `cle1` region) and daily `/api/maintenance` cron schedule. |

### 2.2 Middleware (`bot/middleware/`)

Middlewares are registered in [`bot/app.py`](../../bot/app.py). In Starlette/FastAPI, the last middleware added via `app.add_middleware(...)` wraps the outermost layer of incoming requests:

| File | Execution Order (Inbound) | Responsibility |
| :--- | :---: | :--- |
| [`trusted_proxy_identity.py`](../../bot/middleware/trusted_proxy_identity.py) | 1 (Outermost) | Verifies `X-Proxy-Request-Signature-V2` (or legacy `X-Proxy-Signature`) and populates `request.state.verified_user_email` and `request.state.proxy_authenticated`. |
| `CORSMiddleware` | 2 | Handles cross-origin headers and `OPTIONS` preflight requests for configured `ALLOWED_ORIGINS`. |
| [`csrf.py`](../../bot/middleware/csrf.py) | 3 | Optional Origin/Referer CSRF check when `CSRF_ENABLED=true`. |
| [`cache_headers_middleware.py`](../../bot/middleware/cache_headers_middleware.py) | 4 | Sets `Cache-Control` headers (`immutable` for images, `no-store` for admin/user/authenticated requests, short `public` TTLs for catalog reads). |
| [`metrics_middleware.py`](../../bot/middleware/metrics_middleware.py) | 5 | Measures request duration, attaches `X-Response-Time`, and records route-template telemetry in `MetricsCollector`. |
| [`request_context_middleware.py`](../../bot/middleware/request_context_middleware.py) | 6 (Innermost) | Generates/propagates `X-Request-ID` into `contextvars` for structured logging. |
| [`error_handler.py`](../../bot/middleware/error_handler.py) | Exception Handler | Global exception handler returning structured JSON errors with `request_id`. |

### 2.3 Route Modules (`bot/routes/`)

#### Public, Student & Game Routes
| File | Mounted Endpoints / Responsibility |
| :--- | :--- |
| [`core.py`](../../bot/routes/core.py) | `GET /`, `GET /api/health` (DB ping + pool/cache stats), and `GET /api/images/{filename}` (local file or S3 stream). |
| [`users.py`](../../bot/routes/users.py) | `GET /api/user/web/{email}` (auto-creates user on first login, returns profile/streak/achievements/stats), `GET /api/user/public/{identifier}`, `POST /api/user/web/nickname`. |
| [`onboarding.py`](../../bot/routes/onboarding.py) | `GET /api/user/onboarding/status` and `POST /api/user/onboarding`. |
| [`modules.py`](../../bot/routes/modules.py) | `GET /api/modules/map`, `GET /api/modules/{module_id}`, `GET /api/lessons/{lesson_id}`. |
| [`tasks.py`](../../bot/routes/tasks.py) | `GET /api/tasks/{task_id}` and `POST /api/task/check` (grades module/mini-lesson tasks, updates streaks, progress, and achievements). |
| [`module_review.py`](../../bot/routes/module_review.py) | Mistake review after a mini-lesson: `GET /api/mini-lessons/{id}/review` and `POST /api/mini-lessons/{id}/review/answers`. |
| [`questions.py`](../../bot/routes/questions.py) | Legacy subquestion endpoints: `GET /api/tasks/{task_id}/questions` and `POST /api/tasks/{task_id}/questions/check`. |
| [`trial_tests.py`](../../bot/routes/trial_tests.py) | Solo trial test catalog, nested folder tree (`GET /api/trial-tests/folders`), test details, draft save/load (`/draft`), submission (`/submit`), and history (`/results`). |
| [`trial_tests_coop.py`](../../bot/routes/trial_tests_coop.py) | Cooperative 2-player trial test sessions, invites, answer synchronization, finish grading, results access, and `/ws/trial-tests/coop/{session_id}` WebSocket. |
| [`quizzes.py`](../../bot/routes/quizzes.py) | Quiz catalog (`GET /api/quizzes`), quiz CRUD, question CRUD (inline or linked from `bank_tasks`), and quiz forking (`POST /api/quizzes/{quiz_id}/fork`). |
| [`quiz_game.py`](../../bot/routes/quiz_game.py) | Live quiz sessions: creation, PIN lookup, DB-quota-protected join, avatar selection, host controls (`start`, `next`, `current-question`, `finish`), student `progress`/`answers`/`complete`/`review`, and `/ws/quiz/{session_id}` WebSocket. |
| [`friends.py`](../../bot/routes/friends.py) | Friendships, invite links (`/api/friends/invites`), friend requests, relationship status lookup, and user blocks. |
| [`presence.py`](../../bot/routes/presence.py) | Shared DB heartbeat (`POST /api/presence/heartbeat`) and WebSocket presence (`GET /api/presence/ws-token`, `/ws/presence`). |
| [`reports.py`](../../bot/routes/reports.py) | Student task issue reporting for module tasks (`/api/reports`) and trial test tasks (`/api/trial-test-reports`). |
| [`export.py`](../../bot/routes/export.py) | Personal user data export (`GET /api/export/user/{email}`) and admin statistics export (`GET /api/export/admin/stats`) in JSON/CSV. |
| [`maintenance.py`](../../bot/routes/maintenance.py) | `GET /api/maintenance` bearer-authenticated cron endpoint executing `run_Scheduled_maintenance`. |

#### Administrative Routes (`bot/routes/admin/`)
| File | Responsibility |
| :--- | :--- |
| [`auth.py`](../../bot/routes/admin/auth.py) | `GET /api/admin/check` (returns admin status, role, and permissions) and dev-only `POST /api/admin/set-admin`. |
| [`roles.py`](../../bot/routes/admin/roles.py) | `super_admin` role management (`GET /api/admin/roles`, `POST /api/admin/roles`, `POST /api/admin/roles/restore`, `POST /api/admin/set-role`). |
| [`bank.py`](../../bot/routes/admin/bank.py) | Task bank CRUD, library catalog (`GET /api/admin/bank/catalog`), trash/restore/permanent delete, version history & rollback, quality reports (`dead`, `no-topics`, `duplicates`), audit logs, unrecognized answers, similarity check, and JSON import/export. |
| [`import_tokens.py`](../../bot/routes/admin/import_tokens.py) & [`import_payload.py`](../../bot/routes/admin/import_payload.py) | Stateless HMAC-SHA256 `preview_token` signing/verification and JSON task import validation/deduplication. |
| [`content_curriculum.py`](../../bot/routes/admin/content_curriculum.py) | Module and section CRUD (`/api/admin/modules`, `/api/admin/sections`). |
| [`content_lessons.py`](../../bot/routes/admin/content_lessons.py) | Lesson and mini-lesson CRUD and task reordering (`/api/admin/lessons`, `/api/admin/mini-lessons`). |
| [`content_tasks.py`](../../bot/routes/admin/content_tasks.py) | Placement task CRUD, answer preview check (`POST /api/admin/task-answer/preview-check`), CMS trash management, and ID sequence reset. |
| [`content_validation.py`](../../bot/routes/admin/content_validation.py) & [`content_serialization.py`](../../bot/routes/admin/content_serialization.py) | Shared validation rules (question types, options, subquestions, difficulty, topics, text scale) and placement-to-bank response serializers. |
| [`trial_tests.py`](../../bot/routes/admin/trial_tests.py) | Admin trial test CRUD, nested folder CRUD (`/api/admin/trial-tests/folders`), slot placement upsert/clear (`/slots/{slot_index}`), and task linking from the bank. |
| [`reports.py`](../../bot/routes/admin/reports.py) | Admin moderation of curriculum and trial test reports, plus inline task updates (`PUT /api/admin/reports/tasks/{task_id}`). |
| [`statistics.py`](../../bot/routes/admin/statistics.py) | Statistics workspace: one endpoint per tab (`GET /api/admin/statistics/{overview,students,tasks,modules,trial-tests,quizzes}`), all taking `period`, `tz_offset` and `exclude_admins`. |
| [`ops.py`](../../bot/routes/admin/ops.py) | `super_admin` operational health summary, time-series charts, and incident feed (`/api/admin/ops/*`). |
| [`bank_twins.py`](../../bot/routes/admin/bank_twins.py) | Twin tasks of a bank task (list, manual create) and AI twin drafts (status, generate, independent re-solve check, approve). |
| [`mistake_analytics.py`](../../bot/routes/admin/mistake_analytics.py) | Read-only mistake analytics for every admin role (`GET /api/admin/mistake-analytics`). |

### 2.4 Repositories (`bot/repositories/`)

All repositories inherit from [`BaseRepository`](../../bot/repositories/base.py) (which provides `_connection()`, `_write_transaction()`, `_fetch_one()`, `_fetch_all()`, `batch_insert()`, `batch_update()`):

| Repository | Underlying Mixins / Files | Primary Tables Managed |
| :--- | :--- | :--- |
| `UserRepository` | [`user_repository.py`](../../bot/repositories/user_repository.py) | `users`, `admin_audit_logs` |
| `BankTaskRepository` | [`bank_task_repository.py`](../../bot/repositories/bank_task_repository.py) + [`bank/crud.py`](../../bot/repositories/bank/crud.py), [`bank/catalog.py`](../../bot/repositories/bank/catalog.py), [`bank/versions.py`](../../bot/repositories/bank/versions.py), [`bank/quality.py`](../../bot/repositories/bank/quality.py), [`bank/similarity.py`](../../bot/repositories/bank/similarity.py), [`bank/audit.py`](../../bot/repositories/bank/audit.py), [`bank/unrecognized_answers.py`](../../bot/repositories/bank/unrecognized_answers.py), [`bank/twins.py`](../../bot/repositories/bank/twins.py), [`bank/helpers.py`](../../bot/repositories/bank/helpers.py) | `bank_tasks`, `bank_topics`, `bank_task_topic_map`, `bank_task_versions`, `bank_task_twins`, `admin_audit_logs` |
| `ModuleReviewRepository` | [`module_review_repository.py`](../../bot/repositories/module_review_repository.py) | `module_review_attempts`; reads `solutions`, `user_progress` and `bank_task_twins` for mistake review and mistake analytics |
| `CurriculumRepository` | [`curriculum_repository.py`](../../bot/repositories/curriculum_repository.py) | `modules`, `sections`, `lessons`, `mini_lessons` |
| `TaskRepository` | [`task_repository.py`](../../bot/repositories/task_repository.py) | `tasks`, `user_task_question_progress`, `user_task_completions` |
| `ProgressRepository` | [`progress_repository.py`](../../bot/repositories/progress_repository.py) | `user_progress`, `user_task_completions` |
| `SolutionRepository` | [`solution_repository.py`](../../bot/repositories/solution_repository.py) | `solutions` |
| `AchievementRepository` | [`achievement_repository.py`](../../bot/repositories/achievement_repository.py) | `user_achievements` |
| `TrialTestRepository` | [`trial_test_repository.py`](../../bot/repositories/trial_test_repository.py) + [`trial_folder_repository.py`](../../bot/repositories/trial_folder_repository.py) | `trial_tests`, `trial_test_folders`, `trial_test_tasks`, `trial_test_results`, `trial_test_drafts` |
| `TrialTestCoopRepository` | [`trial_test_coop_repository.py`](../../bot/repositories/trial_test_coop_repository.py) | `trial_test_coop_sessions`, `trial_test_coop_participants`, `trial_test_coop_answers`, `trial_test_coop_results`, `trial_test_coop_invites` |
| `QuizRepository` | [`quiz_repository.py`](../../bot/repositories/quiz_repository.py) + [`quiz_sessions.py`](../../bot/repositories/quiz_sessions.py) + [`quiz_entry_limits.py`](../../bot/repositories/quiz_entry_limits.py) | `quizzes`, `quiz_questions`, `quiz_sessions`, `quiz_session_questions`, `quiz_participants`, `quiz_answers`, `quiz_entry_limits` |
| `ReportRepository` | [`report_repository.py`](../../bot/repositories/report_repository.py) | `reports` |
| `TrialTestReportRepository` | [`trial_test_report_repository.py`](../../bot/repositories/trial_test_report_repository.py) | `trial_test_reports` |
| `StatisticsRepository` | [`statistics_repository.py`](../../bot/repositories/statistics_repository.py) | Read-only, period-scoped analytics over users, solutions, progress, trial tests, quizzes and reports. PostgreSQL only: SQL filters and counts, Python builds ratios, zero-filled series and period comparisons |
| `OnboardingRepository` | [`onboarding_repository.py`](../../bot/repositories/onboarding_repository.py) | `user_onboarding` |
| `FriendsRepository` | [`friends_repository.py`](../../bot/repositories/friends_repository.py) | `friendships`, `friend_requests`, `friend_invites`, `blocks` |
| `OpsRepository` | [`ops_repository.py`](../../bot/repositories/ops_repository.py) | `ops_health_samples`, `ops_incidents` |

### 2.5 Utilities, Services, Migrations & CLI Scripts (`bot/utils/`, `bot/services/`, `bot/migrations/`, `bot/scripts/`)

- **Math Validation Engine (`bot/utils/`):**
  - [`validation.py`](../../bot/utils/validation.py) — Top-level task/choice/written answer normalization and `is_task_answer_correct` dispatcher.
  - [`math_equivalence.py`](../../bot/utils/math_equivalence.py) — Exact numeric (`Fraction`), radical, constant (`\pi`, `e`), logarithm, trig, and expression parser.
  - [`math_algebra.py`](../../bot/utils/math_algebra.py) & [`math_polynomial.py`](../../bot/utils/math_polynomial.py) — Multivariate sparse polynomial ring and rational function (`P/Q`) canonicalizer.
  - [`math_statements.py`](../../bot/utils/math_statements.py) — Equations, linear systems (Gaussian elimination / RREF), inequalities, intervals, and `\in` set membership comparator.
- **Security & Payload Filtering (`bot/utils/`):**
  - [`public_payload.py`](../../bot/utils/public_payload.py) — Whitelists student-facing `options` (`label`, `text`) and `subquestions` so answer keys and authoring metadata never leak before submission.
  - [`internal_proxy_auth.py`](../../bot/utils/internal_proxy_auth.py), [`quiz_entry_auth.py`](../../bot/utils/quiz_entry_auth.py), [`quiz_ws_auth.py`](../../bot/utils/quiz_ws_auth.py) — HMAC signature verification for proxy requests, quiz entry quotas, and WebSocket tokens.
- **AI Twin Drafts (`bot/services/`):**
  - [`ai_twins.py`](../../bot/services/ai_twins.py) — Provider-neutral client for OpenAI-compatible Chat Completions (`AI_TWIN_*` settings): generates number-only twin drafts and re-solves a task without its answer; validates output with Pydantic.
- **Migrations & Operational Scripts (`bot/migrations/` & `bot/scripts/`):**
  - [`migrations/runner.py`](../../bot/migrations/runner.py) & [`migrations/postgres_runner.py`](../../bot/migrations/postgres_runner.py) — Migration runners for SQLite (Alembic) and PostgreSQL (checksum-verified SQL).
  - [`migrations/sqlite_to_postgres.py`](../../bot/migrations/sqlite_to_postgres.py) & [`scripts/migrate_to_neon.py`](../../bot/scripts/migrate_to_neon.py) — Transactional SQLite-to-PostgreSQL snapshot importer with row-count and multiset SHA-256 verification.
  - [`scripts/postgres_backup.py`](../../bot/scripts/postgres_backup.py) — Snapshot-consistent `pg_dump` backup and isolated `mathbot_restore_*` verification tool.
  - [`scripts/upload_images.py`](../../bot/scripts/upload_images.py) — Idempotent local-to-S3 image uploader.
  - [`scripts/preview_bank_workspace.py`](../../bot/scripts/preview_bank_workspace.py) — Isolated disposable SQLite fixture server on `127.0.0.1:8100` for testing the Admin Bank workspace.

---

## 3. Frontend (`web/`)

### 3.1 App Router Pages (`web/app/`)

| Route Path | Source File | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `/` | [`app/page.tsx`](../../web/app/page.tsx) | Public / Student | Landing / dashboard redirect and onboarding entry. |
| `/modules`, `/modules/[id]`, `/lessons/[id]` | [`app/modules/page.tsx`](../../web/app/modules/page.tsx), [`app/modules/[id]/page.tsx`](../../web/app/modules/[id]/page.tsx), [`app/lessons/[id]/page.tsx`](../../web/app/lessons/[id]/page.tsx) | Student | Curriculum map (gated by `NEXT_PUBLIC_MODULES_UI_ENABLED`), module detail, and interactive mini-lesson player. |
| `/lessons/[id]/review/[miniId]` | [`app/lessons/[id]/review/[miniId]/page.tsx`](../../web/app/lessons/[id]/review/[miniId]/page.tsx) | Authenticated Student | Mistake review on twin tasks after a mini-lesson; does not change lesson progress. |
| `/trial-test`, `/trial-test/history`, `/trial-test/[id]`, `/trial-test/[id]/results` | [`app/trial-test/page.tsx`](../../web/app/trial-test/page.tsx), [`app/trial-test/[id]/page.tsx`](../../web/app/trial-test/[id]/page.tsx), [`app/trial-test/[id]/results/page.tsx`](../../web/app/trial-test/[id]/results/page.tsx) | Student | Nested folder browser, solo timed trial test player with draft autosave, and post-submission review. |
| `/trial-test/[id]/coop/[sessionId]`, `.../results` | [`app/trial-test/[id]/coop/[sessionId]/page.tsx`](../../web/app/trial-test/[id]/coop/[sessionId]/page.tsx) | Student | 2-player cooperative trial test workspace and comparative results view. |
| `/quizzes`, `/quizzes/create`, `/quizzes/[id]`, `/quizzes/[id]/edit` | [`app/quizzes/page.tsx`](../../web/app/quizzes/page.tsx), [`app/quizzes/_components/QuizEditor.tsx`](../../web/app/quizzes/_components/QuizEditor.tsx) | Public / Host | Quiz catalog, creation/editing workspace, and session launcher. |
| `/join`, `/quiz/play/[sessionId]`, `/quiz/host/[sessionId]`, `/quiz/review/[sessionId]`, `/quiz/history` | [`app/join/page.tsx`](../../web/app/join/page.tsx), [`app/quiz/play/[sessionId]/page.tsx`](../../web/app/quiz/play/[sessionId]/page.tsx), [`app/quiz/host/[sessionId]/page.tsx`](../../web/app/quiz/host/[sessionId]/page.tsx) | Guest / Student / Host | PIN entry & 2-step mobile avatar selector, live player, teacher scoreboard/controls, and session review. |
| `/profile`, `/profile/[id]`, `/profile/export`, `/achievements` | [`app/profile/page.tsx`](../../web/app/profile/page.tsx), [`app/achievements/page.tsx`](../../web/app/achievements/page.tsx) | Student / Public | User profile, weekly activity, friends/invites management, data export, and achievements catalog. |
| `/admin` | [`app/admin/page.tsx`](../../web/app/admin/page.tsx) | Any Admin | Admin hub routing users to capabilities permitted by their role. |
| `/admin/bank`, `/admin/bank/quality`, `/admin/bank/audit` | [`app/admin/bank/page.tsx`](../../web/app/admin/bank/page.tsx), [`app/admin/bank/_components/BankWorkspace.tsx`](../../web/app/admin/bank/_components/BankWorkspace.tsx) | Admin | Library catalog, full-width task detail/editor/preview, PDF worksheet export, quality reports, and audit log. |
| `/admin/cms/**` | [`app/admin/cms/_components/CmsWorkspace.tsx`](../../web/app/admin/cms/_components/CmsWorkspace.tsx) | `content_manage` | Hierarchical curriculum editor (`Modules -> Sections -> Lessons -> Mini-lessons -> Tasks`). |
| `/admin/trial-tests/**` | [`app/admin/trial-tests/_components/TrialTestsCatalog.tsx`](../../web/app/admin/trial-tests/_components/TrialTestsCatalog.tsx), [`TrialTestWorkspace.tsx`](../../web/app/admin/trial-tests/_components/TrialTestWorkspace.tsx) | `content_manage` | Nested folder management (`folder/[folderId]`) and 40-slot trial test composer. |
| `/admin/reports`, `/admin/roles`, `/admin/ops`, `/admin/guides` | [`app/admin/reports/page.tsx`](../../web/app/admin/reports/page.tsx), [`app/admin/roles/page.tsx`](../../web/app/admin/roles/page.tsx), [`app/admin/ops/page.tsx`](../../web/app/admin/ops/page.tsx) | Role-gated | Issue report moderation, `super_admin` role manager, ops health dashboard, and authoring guides. |
| `/admin/statistics` | [`app/admin/statistics/_components/StatisticsWorkspace.tsx`](../../web/app/admin/statistics/_components/StatisticsWorkspace.tsx) and one `*Tab.tsx` per tab; shared pieces in `primitives.tsx`, `charts.tsx`, `format.ts` and `palette.ts` | `review_manage` | Statistics workspace: period and admin filter in the URL, six lazily loaded tabs, charts with table views, sortable lists with CSV export. |
| `/admin/mistakes` | [`app/admin/mistakes/page.tsx`](../../web/app/admin/mistakes/page.tsx) | Any Admin | Mistake analytics: first-attempt mistakes by task, topic and student, review outcomes and twin coverage. |
| `/api/auth/[...nextauth]` | [`app/api/auth/[...nextauth]/route.ts`](../../web/app/api/auth/[...nextauth]/route.ts) | Public | NextAuth Google OAuth and JWT session handler. |
| `/api/backend/[...path]` | [`app/api/backend/[...path]/route.ts`](../../web/app/api/backend/[...path]/route.ts) | Proxy Boundary | Authenticates, normalizes, signs (HMAC V2), and forwards requests to FastAPI. |

### 3.2 Key Frontend Libraries & Components (`web/components/`, `web/lib/`)

- **Math Rendering & Input:**
  - [`components/ui/MathRender.tsx`](../../web/components/ui/MathRender.tsx) — Mixed prose/LaTeX tokenizer and MathLive `<math-span>` / `<math-div>` renderer.
  - [`components/ui/MathFieldInput.tsx`](../../web/components/ui/MathFieldInput.tsx) & [`components/student/StudentMathAnswerInput.tsx`](../../web/components/student/StudentMathAnswerInput.tsx) — Interactive MathLive `<math-field>` wrappers with custom virtual keyboards ([`lib/student-math-keyboard.ts`](../../web/lib/student-math-keyboard.ts)) and storage normalization ([`lib/math-normalize.ts`](../../web/lib/math-normalize.ts)).
- **Bank PDF Worksheet Exporter:**
  - [`lib/bank-worksheet.ts`](../../web/lib/bank-worksheet.ts), [`lib/use-bank-worksheet-selection.ts`](../../web/lib/use-bank-worksheet-selection.ts), [`lib/export-bank-worksheet.ts`](../../web/lib/export-bank-worksheet.ts), [`lib/worksheet-fonts.ts`](../../web/lib/worksheet-fonts.ts), [`components/admin/BankWorksheetDialog.tsx`](../../web/components/admin/BankWorksheetDialog.tsx), and [`components/admin/BankWorksheetDocument.tsx`](../../web/components/admin/BankWorksheetDocument.tsx).
- **API Client & Hooks:**
  - [`lib/api/client.ts`](../../web/lib/api/client.ts) — Core `fetchWithErrorHandling` wrapper with 30s timeout and 1.5s GET deduplication cache.
  - [`lib/api/`](../../web/lib/api/) — Domain-specific typed API clients (`admin-bank.ts`, `admin-trial-tests.ts`, `quizzes.ts`, `trial-tests.ts`, `coop.ts`, `friends.ts`, `modules.ts`, `user.ts`, etc.).
  - [`lib/use-quiz-connection.ts`](../../web/lib/use-quiz-connection.ts), [`lib/use-quiz-player.ts`](../../web/lib/use-quiz-player.ts), [`lib/use-quiz-draft.ts`](../../web/lib/use-quiz-draft.ts), [`lib/use-coop-answer-sync.ts`](../../web/lib/use-coop-answer-sync.ts) — Realtime state synchronization and resilient draft/answer persistence hooks.
