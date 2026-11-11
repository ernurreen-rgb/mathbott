# Implemented Features

This document inventories all features that are **currently implemented and active** in the codebase (last reviewed 2026-11-10, after mistake review, twin tasks, AI twin drafts and mistake analytics), mapped directly to their backend routes, repositories, and frontend pages.

---

## 1. Student Learning & Curriculum (`modules` -> `sections` -> `lessons` -> `mini_lessons` -> `tasks`)

- **4-Level Curriculum Hierarchy**:
  - Students browse Modules, Sections, Lessons, and 4 Mini-Lessons per lesson ([`bot/routes/modules.py`](../../bot/routes/modules.py), [`bot/repositories/curriculum_repository.py`](../../bot/repositories/curriculum_repository.py)).
  - Mini-lessons contain ordered task placements (`tasks`) supporting five question types:
    - `input` (free-form numerical/algebraic LaTeX answer via MathLive `<math-field>`)
    - `mcq` / `mcq6` (4-option or 6-option multiple choice)
    - `select` (two-statement `[A, B]` matching)
    - `tf` (True/False)
- **Progress Tracking (`user_progress`, `user_task_completions`)**:
  - Submitting a correct answer via `POST /api/task/check` ([`bot/routes/tasks.py`](../../bot/routes/tasks.py)) records completion in `user_progress` and `user_task_completions` ([`bot/repositories/progress_repository.py`](../../bot/repositories/progress_repository.py)) and updates module/section/lesson completion percentages (`GET /api/modules/map`, `GET /api/modules/{module_id}`, `GET /api/lessons/{lesson_id}`).
- **Mistake Review after a Mini-Lesson**:
  - Tasks answered wrong on the first attempt are re-practised on number-only twin tasks once the mini-lesson task is solved (see [section 9](#9-mistake-review-twin-tasks-ai-drafts--mistake-analytics)).
- **Note on `/modules` UI Availability**:
  - The `/modules` map entry page (`web/app/modules/page.tsx`) is enabled by default; setting `NEXT_PUBLIC_MODULES_UI_ENABLED=false` at build time shows a blurred preview instead (see [Planned & Flagged Features](planned-features.md)).

---

## 2. Exact Mathematical Answer Equivalence Engine

Implemented in [`bot/utils/validation.py`](../../bot/utils/validation.py), [`bot/utils/math_equivalence.py`](../../bot/utils/math_equivalence.py), [`bot/utils/math_algebra.py`](../../bot/utils/math_algebra.py), [`bot/utils/math_polynomial.py`](../../bot/utils/math_polynomial.py), and [`bot/utils/math_statements.py`](../../bot/utils/math_statements.py):
- **Multi-stage Deterministic Grading**:
  1. Direct normalized text comparison (handling whitespace, LaTeX wrappers, Unicode minus signs, decimal commas).
  2. Exact rational (`fractions.Fraction`), radical, constant (`\pi`, `e`), logarithm, and trigonometric expression equivalence (`math_equivalence.py`).
  3. Algebraic equations, linear systems (via exact Gaussian elimination / RREF), inequalities, intervals, and `\in` set membership (`math_statements.py`).
  4. Multivariate sparse polynomial and rational function (`P/Q`) canonicalization (`math_algebra.py`, `math_polynomial.py`).
- **Resource & Complexity Bounds**:
  - Enforces strict limits (`_MAX_EXPRESSION_LENGTH = 512`, `_MAX_AST_NODES = 256`, `_MAX_POLYNOMIAL_DEGREE = 128`, `_MAX_POLYNOMIAL_TERMS = 512`, `_MAX_NUMBER_BITS = 4096`) to prevent CPU/memory exhaustion.
- **Unrecognized Answer Telemetry**:
  - Incorrect written answers submitted on bank-linked tasks are normalized and aggregated so teachers can promote valid alternative forms to `accepted_answers` (`POST /api/admin/bank/tasks/{task_id}/accepted-answers`).

---

## 3. Trial Tests (Nested Folders, Solo Mode & Real-Time Co-op)

### 3.1 Nested Trial Test Folders & 40-Slot Templates
- **Folder Tree**: Trial tests are organized into arbitrary-depth nested folders (`trial_test_folders` table, `GET /api/trial-tests/folders`, [`bot/repositories/trial_folder_repository.py`](../../bot/repositories/trial_folder_repository.py)). Leaf folders hold tests; non-empty folders cannot be deleted (`409 Conflict`).
- **Exam Templates**: Each trial test (`trial_tests`) supports configurable task slots (`expected_tasks_count`, default `40`), linked to `bank_tasks` via `trial_test_tasks.bank_task_id`.

### 3.2 Solo Trial Test Mode
- Implemented in [`bot/routes/trial_tests.py`](../../bot/routes/trial_tests.py) and [`web/app/trial-test/`](../../web/app/trial-test/):
  - **Resilient Draft Autosave**: `GET / PUT /api/trial-tests/{test_id}/draft` persists in-progress answers and `current_index` in `trial_test_drafts`, flushing with `keepalive: true` on tab close or SPA navigation.
  - **Idempotent Submission & Snapshot Review**: `POST /api/trial-tests/{test_id}/submit` grades all answers, saves a frozen task review snapshot in `trial_test_results`, clears the draft, updates daily streaks, and unlocks achievements.

### 3.3 Real-Time 2-Player Co-op Trial Tests
- Implemented in [`bot/routes/trial_tests_coop.py`](../../bot/routes/trial_tests_coop.py), [`bot/repositories/trial_test_coop_repository.py`](../../bot/repositories/trial_test_coop_repository.py), and [`web/app/trial-test/[id]/coop/[sessionId]/page.tsx`](../../web/app/trial-test/[id]/coop/[sessionId]/page.tsx):
  - **Session & Friend Invitations**: Host creates a session (`POST /api/trial-tests/{test_id}/coop/session` -> `red` slot) and invites a friend (`POST /api/trial-tests/{test_id}/coop/invite`). Friends accept (`POST /api/trial-tests/coop/invites/{invite_id}/accept` -> `blue` slot) or decline.
  - **Dual-Transport Sync**: Synchronizes shared answers (`PUT /api/trial-tests/coop/session/{session_id}/answers`) via WebSocket (`/ws/trial-tests/coop/{session_id}`) or 2.5-second HTTP polling (`GET /api/trial-tests/coop/session/{session_id}`).
  - **Independent Finish & Results Gate**: Each player finishes via `POST /api/trial-tests/{test_id}/coop/finish`, recording individual `trial_test_results` linked in `trial_test_coop_results`.

---

## 4. Live Classroom Quizzes (`/quizzes`, `/join`, `/quiz/*`)

Implemented in [`bot/routes/quizzes.py`](../../bot/routes/quizzes.py), [`bot/routes/quiz_game.py`](../../bot/routes/quiz_game.py), [`bot/repositories/quiz_repository.py`](../../bot/repositories/quiz_repository.py), [`bot/repositories/quiz_sessions.py`](../../bot/repositories/quiz_sessions.py), and [`bot/repositories/quiz_entry_limits.py`](../../bot/repositories/quiz_entry_limits.py):
- **Quiz Library & Forking**: Teachers create, edit, and fork (`POST /api/quizzes/{quiz_id}/fork`) quizzes in `teacher_paced` or `self_paced` mode.
- **Frozen Session Snapshots**: Starting a live session (`POST /api/quiz-sessions`) issues a 6-digit `pin_code` and freezes all questions into `quiz_session_questions`.
- **Database-Enforced Entry Quotas (`quiz_entry_limits`)**:
  - Protects `GET /api/quiz-sessions/pin/{pin_code}` and `POST /api/quiz-sessions/join` with shared 60-second per-network budgets (`1200` requests, `30` distinct PINs, `300` new participants) and a room cap (`500` participants) across serverless workers.
- **Realtime Gameplay & Polling Budget Optimization**:
  - Supports both `/ws/quiz/{session_id}` WebSockets and 4-second `/progress` HTTP polling (pausing automatically in hidden browser tabs).
  - Supports speed-bonus scoring, per-student shuffled question orders (`quiz_participants.question_order`), anonymous guest participation with later account claiming (`POST /api/quiz-sessions/{session_id}/claim`), and post-game review (`/quiz/review/[sessionId]`).

---

## 5. Gamification: Daily Streaks & Achievements

- **Daily Streaks**: Tracked in `users.streak` and `users.last_streak_date` ([`bot/repositories/user_repository.py`](../../bot/repositories/user_repository.py)), incremented on daily task or trial test completion.
- **Achievements (`user_achievements`)**: Evaluated automatically by [`bot/repositories/achievement_repository.py`](../../bot/repositories/achievement_repository.py) and surfaced on `/profile` and `/achievements`.

---

## 6. Social Graph, Friend Invites & Shared Presence

- **Friends & Shareable Links** ([`bot/routes/friends.py`](../../bot/routes/friends.py), [`bot/repositories/friends_repository.py`](../../bot/repositories/friends_repository.py), [`web/app/profile/page.tsx`](../../web/app/profile/page.tsx)):
  - Shareable friend invite tokens (`/api/friends/invites`), direct friend requests (`/api/friends/requests`), friend list management (`/api/friends`), and user blocking (`/api/friends/blocks`).
- **Online Presence** ([`bot/routes/presence.py`](../../bot/routes/presence.py)):
  - Supports shared DB heartbeat (`POST /api/presence/heartbeat` with 70-second TTL) on serverless deployments and `/ws/presence` WebSockets on stateful deployments.

---

## 7. Centralized Question Bank Workspace & Client PDF Export (`/admin/bank`)

Implemented in [`bot/routes/admin/bank.py`](../../bot/routes/admin/bank.py), [`bot/repositories/bank/`](../../bot/repositories/bank/), [`web/app/admin/bank/_components/BankWorkspace.tsx`](../../web/app/admin/bank/_components/BankWorkspace.tsx), and [`web/lib/export-bank-worksheet.ts`](../../web/lib/export-bank-worksheet.ts):
- **Topic Catalog & Full-Width Workspace (`d1d83b3`)**:
  - `GET /api/admin/bank/catalog` returns active, trash, unused, and topicless task counts alongside topic tags (`bank_topics`) with active task counts.
  - Compact filterable task list (search by text or `#ID`, difficulty `A`/`B`/`C`, question type, usage, `ANY`/`ALL` multi-topic matching, sorting, 20/50/100 pagination).
  - Selecting or creating a task opens a full-width workspace with unified state across **Task Detail**, **Editor**, and live **Student Preview** modes (`/admin/bank?task=125&mode=edit`).
- **Optimistic Concurrency, Versioning & Rollback**:
  - Checks `expected_current_version` on save (`409 VERSION_CONFLICT` on concurrent edits), stores immutable snapshots in `bank_task_versions`, and supports one-click version rollback (`POST /api/admin/bank/tasks/{task_id}/rollback`).
- **Similarity Deduplication & Two-Step JSON Import**:
  - `POST /api/admin/bank/tasks/similar` and `POST /api/admin/bank/tasks/import` detect near-duplicate tasks (`SequenceMatcher`) and use stateless HMAC-signed preview tokens (`bot/routes/admin/import_tokens.py`).
- **Quality & Audit Dashboards (`/admin/bank/quality`, `/admin/bank/audit`)**:
  - Surfaces unused ("dead") tasks, tasks missing topics, duplicate clusters, unrecognized student answers, and bank audit history.
- **Twin Tasks (Егіздер)**:
  - Each task workspace has a **Twins** tab for number-only variants used by mistake review, created manually or as AI drafts (see [section 9](#9-mistake-review-twin-tasks-ai-drafts--mistake-analytics)). Twins are hidden from the library, task pickers, catalog counts and quality reports; the catalog's **Twin tasks** entry lists them.
- **Client-Side Printable PDF Worksheet Export**:
  - Admins select up to 100 tasks across pages/filters, reorder them in [`BankWorksheetDialog.tsx`](../../web/components/admin/BankWorksheetDialog.tsx), and download a multi-page A4 `.pdf` generated client-side via `html-to-image` + `pdf-lib` (`web/lib/export-bank-worksheet.ts`) with MathLive formulas and embedded images, without exposing answer keys.

---

## 8. Admin CMS, Reports, Roles, Analytics & Operations

- **Curriculum & Trial Test CMS** (`/admin/cms`, `/admin/trial-tests`, [`bot/routes/admin/content_curriculum.py`](../../bot/routes/admin/content_curriculum.py), [`content_lessons.py`](../../bot/routes/admin/content_lessons.py), [`content_tasks.py`](../../bot/routes/admin/content_tasks.py), [`bot/routes/admin/trial_tests.py`](../../bot/routes/admin/trial_tests.py)):
  - Full CRUD for Modules, Sections, Lessons, Mini-lessons, Tasks, Trial Test Folders, and 40-slot Trial Tests, plus trash restore/empty.
- **Problem Reports Moderation** (`/admin/reports`, [`bot/routes/admin/reports.py`](../../bot/routes/admin/reports.py)):
  - Moderation queue for curriculum task reports (`/api/admin/reports`) and trial test task reports (`/api/admin/trial-test-reports`) with inline task fixing.
- **RBAC Role Management** (`/admin/roles`, [`bot/routes/admin/roles.py`](../../bot/routes/admin/roles.py)):
  - `super_admin` assignment and emergency bootstrap recovery (`POST /api/admin/roles/restore`) across `super_admin`, `content_editor`, and `reviewer` roles.
- **Platform Statistics & Ops Health Monitor** (`/admin/statistics`, `/admin/ops`, [`bot/routes/admin/statistics.py`](../../bot/routes/admin/statistics.py), [`bot/routes/admin/ops.py`](../../bot/routes/admin/ops.py)):
  - Platform analytics, CSV/JSON exports (`/api/export/admin/stats`), rolling latency/error metrics (`ops_health_samples`), deduplicated incidents (`ops_incidents`), and optional Telegram alerts (`bot/utils/alerts.py`).
- **Mistake Analytics** (`/admin/mistakes`): first-attempt mistakes by task, topic and student, with review outcomes and twin coverage (see [section 9](#9-mistake-review-twin-tasks-ai-drafts--mistake-analytics)).

---

## 9. Mistake Review, Twin Tasks, AI Drafts & Mistake Analytics

### 9.1 Mistake Review for Students (`/lessons/[id]/review/[miniId]`)
Implemented in [`bot/routes/module_review.py`](../../bot/routes/module_review.py), [`bot/repositories/module_review_repository.py`](../../bot/repositories/module_review_repository.py) and [`web/app/lessons/[id]/review/[miniId]/page.tsx`](../../web/app/lessons/[id]/review/[miniId]/page.tsx):
- **What is reviewed**: a mini-lesson task whose **first** recorded attempt in `solutions` was wrong and which the student has since solved (`user_progress.status = 'completed'`). This works retroactively for lessons solved before the feature existed.
- **What is served**: the next approved twin the student has not seen yet, in twin order; when a task has no twins, the original task once. A wrong answer shows the correct answer and the solution image (if any) and offers the next twin; with no twins left the task becomes a **weak spot** (`weak`). Statuses: `pending`, `resolved`, `weak`.
- **No effect on progress**: attempts are stored in `module_review_attempts`, never in `solutions`, so lesson progress, solved counters, streaks and achievements do not change.
- **Lesson page**: completed mini-lessons with unreviewed mistakes show a badge and a **Талдауды бастау** card; finishing the last task stops on the completion screen to offer the review, and a completed lesson offers the review instead of redirecting. The lesson back button opens the parent module section.
- **Mandatory before the next lesson**: while a lesson has unreviewed mistakes in its completed mini-lessons, the **next** lesson in module order (across section boundaries) is closed. Mini-lessons inside a lesson stay free, lessons further on can still be opened from the map, a lesson the student has already answered in never closes, and admins are never blocked. A mistake counts as reviewed once it is `resolved` or `weak`, so a student can always get through. The module map shows the closed lesson with a lock and **Алдымен қателер**; opening it shows how many mistakes remain and a button straight into that review, which returns to the now-open lesson. The earlier lesson's review card warns that the next lesson waits, and a finished lesson offers **Келесі сабақ** once it is open.
- **API**: `GET /api/mini-lessons/{mini_lesson_id}/review` and `POST /api/mini-lessons/{mini_lesson_id}/review/answers` (the server accepts an answer only for the twin it currently serves, otherwise `409`); `GET /api/lessons/{lesson_id}` includes a `review` summary per mini-lesson, `lock` and `next_lesson`; `GET /api/modules/{module_id}` includes `lock` per lesson; `POST /api/task/check` answers `423` for a task in a closed lesson.

### 9.2 Twin Tasks in the Bank
Implemented in [`bot/repositories/bank/twins.py`](../../bot/repositories/bank/twins.py), [`bot/routes/admin/bank_twins.py`](../../bot/routes/admin/bank_twins.py) and [`BankTwinsPanel.tsx`](../../web/app/admin/bank/_components/BankTwinsPanel.tsx):
- A twin is an ordinary bank task linked to exactly one source in `bank_task_twins`; twins of twins are refused, the question type must match the source, and a copy identical to the source (text, answer, options, sub-questions, no new image) is refused.
- **Create twin** opens the editor pre-filled from the source with the question type locked; topics, difficulty and the source image are copied. Twins are edited, versioned and moved to trash like any bank task; permanently deleting a source moves its active twins to trash.
- The CMS mini-lesson view shows how many tasks have twins (`twin_count` on `GET /api/admin/mini-lessons/{id}/tasks`), and wrong answers on twins appear in **Unrecognized answers** with the source `module_review`.

### 9.3 AI Twin Drafts (optional)
Implemented in [`bot/services/ai_twins.py`](../../bot/services/ai_twins.py):
- Works with any provider that speaks the OpenAI Chat Completions format (JSON mode). It is **off** until `AI_TWIN_BASE_URL`, `AI_TWIN_API_KEY` and `AI_TWIN_MODEL` are all set on the API (see [`deploy/NEON_VERCEL.md`](../../deploy/NEON_VERCEL.md#ai-twin-drafts)); the key never reaches the browser.
- `POST /api/admin/bank/tasks/{task_id}/twins/ai-drafts` (content editors, 20 per hour) asks for three number-only twins and stores those that pass the bank's own payload rules as **drafts** (`status = 'draft'`, `origin = 'ai'`); drafts are never served to students. Tasks with an image are refused because numbers may be drawn in the picture.
- Every draft is then re-solved by a separate request that does not see the draft's answer (`POST /api/admin/bank/tasks/{task_id}/ai-check`, 120 per hour); the platform's answer checker compares the two and stores `match`, `mismatch` or `error` with the checked version, so an edit afterwards marks the check stale.
- A teacher approves a draft with `POST /api/admin/bank/tasks/{task_id}/approve`; approval of a mismatch asks for confirmation. `GET /api/admin/bank/ai-twins/status` reports whether the feature is configured and the model name, never the key.

### 9.4 Mistake Analytics (`/admin/mistakes`)
Implemented in [`bot/routes/admin/mistake_analytics.py`](../../bot/routes/admin/mistake_analytics.py) and [`web/app/admin/mistakes/page.tsx`](../../web/app/admin/mistakes/page.tsx):
- `GET /api/admin/mistake-analytics?period=7d|30d|all&module_id=` is open to every admin role (read-only). The period applies to the time of the first attempt.
- Shows totals (first attempts, mistakes and rate, resolved, weak, pending, tasks without twins), the 50 tasks with the most first-attempt mistakes with their review outcomes and twin counts (linking to the bank twins tab), mistakes by bank topic, and up to 100 students ordered by weak spots with their weak topics. Review states use the same rules as the student review page. Student e-mail addresses are returned to `super_admin` only.
