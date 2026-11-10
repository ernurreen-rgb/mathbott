# API Overview & Endpoint Catalog

This document defines the HTTP and WebSocket API contracts of the QazMath (`CursorMathbot`, `HEAD = d1d83b3`) platform, verified directly against `bot/routes/`, `bot/routes/admin/`, `bot/app.py`, and `web/app/api/`.

---

## 1. API Gateway & Authentication Architecture

### 1.1 Next.js Same-Origin Proxy (`/api/backend/[...path]`)
All browser HTTP requests use [`web/lib/api/client.ts`](../../web/lib/api/client.ts) and target `/api/backend/<path>`, which maps to [`web/app/api/backend/[...path]/route.ts`](../../web/app/api/backend/[...path]/route.ts) -> `/api/<path>` on the FastAPI backend (`BACKEND_URL`).

For every proxied request, the Next.js server strips any client-supplied `X-Proxy-*`, `Authorization`, and `Cookie` headers, reads the NextAuth JWT session (`web/app/api/auth/[...nextauth]/route.ts`), enforces the route policy (`public`, `guest_capable`, `authenticated`, or `admin`), and attaches HMAC-SHA256 V2 authentication headers signed with `INTERNAL_PROXY_SHARED_SECRET`:

```text
X-Proxy-Request-Ts: <unix-timestamp-seconds>
X-Proxy-Request-Nonce: <uuidv4-nonce>
X-Proxy-Body-Sha256: <hex-sha256-of-normalized-request-body>
X-Proxy-User-Email: <normalized-lowercase-email> (when authenticated)
X-Proxy-Request-Signature-V2: <hex-hmac-sha256>
X-Proxy-Signature: <legacy-v1-email-signature> (when authenticated)
```

For quiz PIN lookup/join (`GET /api/quiz-sessions/pin/{pin}` and `POST /api/quiz-sessions/join`), the proxy also attaches an anonymized HMAC network key derived from the trusted ingress IP (`web/lib/quiz-entry-identity.ts` and [`bot/utils/quiz_entry_auth.py`](../../bot/utils/quiz_entry_auth.py)):
```text
X-Proxy-Quiz-Entry-Key: <hmac-network-bucket>
X-Proxy-Quiz-Entry-Signature: <hex-hmac-sha256>
```

Verified by [`bot/middleware/trusted_proxy_identity.py`](../../bot/middleware/trusted_proxy_identity.py) and [`bot/utils/internal_proxy_auth.py`](../../bot/utils/internal_proxy_auth.py):
- **Clock skew limit**: `±300` seconds.
- **Replay protection**: Nonces are tracked in `_REPLAY_CACHE` (`_MAX_REPLAY_NONCES = 50000`) for the 300-second window; replayed nonces return `401 Invalid internal proxy signature`.
- **Identity binding**: Non-admin authenticated requests have their `email` / `user_email` / `sender_email` / `blocker_email` rewritten by the proxy to the session user's email and verified by `require_internal_identity` in [`bot/dependencies.py`](../../bot/dependencies.py).

### 1.2 WebSocket Short-Lived Ticket Authentication
When `NEXT_PUBLIC_REALTIME_TRANSPORT=websocket`, clients obtain a short-lived HMAC token ([`bot/utils/quiz_ws_auth.py`](../../bot/utils/quiz_ws_auth.py)) over the authenticated HTTP proxy before opening a WebSocket:
1. `GET /api/presence/ws-token` -> `WS /ws/presence?token=<ticket>`
2. `GET /api/quiz-sessions/{session_id}/ws-token` -> `WS /ws/quiz/{session_id}?token=<ticket>`
3. `GET /api/trial-tests/coop/session/{session_id}/ws-token` -> `WS /ws/trial-tests/coop/{session_id}?token=<ticket>`

### 1.3 Admin Role-Based Access Control (RBAC)
Admin endpoints (`/api/admin/*`) enforce capabilities via `Depends(require_admin*)` in [`bot/dependencies.py`](../../bot/dependencies.py) and [`bot/repositories/user_repository.py`](../../bot/repositories/user_repository.py):

| Role | Granted Capabilities | Scope |
|---|---|---|
| `content_editor` | `content_manage` | Curriculum CMS (`/api/admin/modules`, `/sections`, `/lessons`, `/mini-lessons`, `/tasks`), Task Bank CRUD/import/export (`/api/admin/bank/*`), and Trial Tests & Folders (`/api/admin/trial-tests/*`). |
| `reviewer` | `review_manage` | Student report moderation (`/api/admin/reports`, `/api/admin/trial-test-reports`), Bank quality/audit views, and platform statistics (`/api/admin/statistics`, `/api/export/admin/stats`). |
| `super_admin` | `content_manage`, `review_manage`, `super_critical` | All admin endpoints, including role assignments (`/api/admin/roles`), permanent deletes (`/permanent`, `/trash/empty`), ID counter resets, and `/api/admin/ops/*`. |

---

## 2. Public & Student HTTP Endpoints (`bot/routes/`)

### 2.1 Core, Health & Media ([`bot/routes/core.py`](../../bot/routes/core.py), [`bot/routes/maintenance.py`](../../bot/routes/maintenance.py))

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Public | Root service info (`{"status": "ok", "service": "mathbot-api"}`). |
| `GET` | `/api/health` | Public | Performs a live `SELECT 1` DB probe and returns `{"status": "ok", "database": "ok"}` (or `503` on DB failure). |
| `GET` | `/api/images/{filename}` | Public | Serves task/CMS images from local `bot/images/` or returns a `307 Temporary Redirect` to `R2_PUBLIC_BASE_URL/{filename}` when `STORAGE_BACKEND=r2`. |
| `GET` | `/api/maintenance` | Public | Returns maintenance banner status (`enabled`, `message`). |

### 2.2 Users & Onboarding ([`bot/routes/users.py`](../../bot/routes/users.py), [`bot/routes/onboarding.py`](../../bot/routes/onboarding.py), [`bot/routes/export.py`](../../bot/routes/export.py))

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/user/web/{email}` | Authenticated (Self) | Fetches or lazily creates the user profile, returning streak, achievements, solved counts, and admin role/permissions. |
| `GET` | `/api/user/public/{identifier}` | Authenticated | Fetches public profile card by user ID or nickname (`friend_status`, streak, achievements). |
| `POST` | `/api/user/web/nickname` | Authenticated | Sets or updates the user's unique nickname. |
| `GET` | `/api/user/onboarding/status` | Authenticated | Checks whether the user has completed the initial onboarding flow. |
| `POST` | `/api/user/onboarding` | Authenticated | Submits onboarding responses (`user_onboarding`). |
| `GET` | `/api/export/user/{email}` | Authenticated (Self) | Exports personal user data, progress, and results as JSON (`rate_limit: 5/min`). |

### 2.3 Curriculum: Modules, Lessons, Tasks & Sub-Questions ([`bot/routes/modules.py`](../../bot/routes/modules.py), [`bot/routes/tasks.py`](../../bot/routes/tasks.py), [`bot/routes/questions.py`](../../bot/routes/questions.py))

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/modules/map` | Optional Auth | Returns the full curriculum map (Modules -> Sections -> Lessons -> Mini-lessons) with per-user completion progress. |
| `GET` | `/api/modules/{module_id}` | Optional Auth | Returns a single module's details, sections, and user progress. |
| `GET` | `/api/lessons/{lesson_id}` | Optional Auth | Returns a lesson and its 4 mini-lessons with tasks and user completion status. |
| `GET` | `/api/tasks/{task_id}` | Optional Auth | Returns a single curriculum task definition. |
| `POST` | `/api/task/check` | Authenticated | Evaluates a student's answer via `answers_equivalent`, updates `user_progress`, `user_task_completions`, daily streak, and achievements. |
| `GET` | `/api/tasks/{task_id}/questions` | Optional Auth | Lists sub-questions for a multi-question task and user progress (`user_task_question_progress`). |
| `POST` | `/api/tasks/{task_id}/questions/check` | Authenticated | Checks an answer to an individual sub-question within a task. |

`GET /api/lessons/{lesson_id}` also returns `review` (`mistakes`, `resolved`, `weak`, `pending`) per mini-lesson for the signed-in student.

### 2.3.1 Mistake Review ([`bot/routes/module_review.py`](../../bot/routes/module_review.py))

The proxy treats `/api/mini-lessons` as an identity path: it always signs these requests with the session email, and production rejects them without a valid signature.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/mini-lessons/{mini_lesson_id}/review` | Authenticated | First-attempt mistakes of the mini-lesson with their state (`pending`, `resolved`, `weak`) and the next task to solve (an unseen approved twin, or the original once when the task has no twins). Answers are never included. |
| `POST` | `/api/mini-lessons/{mini_lesson_id}/review/answers` | Authenticated (`30/minute`) | Grades `{task_id, bank_task_id, answer}` for the task the server currently serves (`409` otherwise). Stores the attempt in `module_review_attempts` only; progress, streaks and achievements are unchanged. Returns the correct answer and solution image on a wrong answer. |

### 2.4 Trial Tests — Solo Mode ([`bot/routes/trial_tests.py`](../../bot/routes/trial_tests.py))

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/trial-tests/folders` | Optional Auth | Lists trial test folders (`trial_test_folders`) and root-level unfiled tests. |
| `GET` | `/api/trial-tests` | Optional Auth | Lists published trial tests with optional `category` filter and user attempt summaries. |
| `GET` | `/api/trial-tests/categories` | Public | Lists distinct trial test categories (`ҰБТ`, `НЗМ`, `БИЛ`, etc.). |
| `GET` | `/api/trial-tests/drafts` | Authenticated | Lists active saved drafts (`trial_test_drafts`) for the current user across all trial tests. |
| `GET` | `/api/trial-tests/{test_id}` | Optional Auth | Returns a trial test and its ordered tasks (without exposing correct answers). |
| `POST` | `/api/trial-tests/{test_id}/submit` | Authenticated | Grades all submitted answers (`answers_equivalent`), records `trial_test_results`, clears the user's draft, and unlocks achievements. |
| `GET` | `/api/trial-tests/{test_id}/draft` | Authenticated | Retrieves the user's in-progress answer draft for `test_id`. |
| `PUT` | `/api/trial-tests/{test_id}/draft` | Authenticated | Upserts the user's in-progress answer draft (`answers`, `current_index`). |
| `GET` | `/api/trial-tests/{test_id}/results` | Authenticated | Lists historical attempt results for `test_id` for the current user. |

### 2.5 Trial Tests — Real-Time 2-Player Co-op ([`bot/routes/trial_tests_coop.py`](../../bot/routes/trial_tests_coop.py))

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/trial-tests/{test_id}/coop/session` | Authenticated | Creates a new 2-player co-op session (`trial_test_coop_sessions`) with the creator as `red` host. |
| `GET` | `/api/trial-tests/coop/session/{session_id}` | Authenticated | Returns session state, participants (`red`/`blue`), tasks, and shared answers. |
| `PUT` | `/api/trial-tests/coop/session/{session_id}/answers` | Authenticated | Updates an answer for a task in the co-op session and broadcasts over WebSocket. |
| `POST` | `/api/trial-tests/{test_id}/coop/finish` | Authenticated | Marks the current participant as finished; when both players finish, grades and stores `trial_test_results` and `trial_test_coop_results`. |
| `GET` | `/api/trial-tests/coop/session/{session_id}/results` | Authenticated | Returns finalized co-op test results and per-player breakdowns. |
| `POST` | `/api/trial-tests/{test_id}/coop/invite` | Authenticated | Sends a co-op session invite to a friend (`trial_test_coop_invites`). |
| `GET` | `/api/trial-tests/coop/invites` | Authenticated | Lists pending incoming co-op invitations for the current user. |
| `POST` | `/api/trial-tests/coop/invites/{invite_id}/accept` | Authenticated | Accepts an invite, adds the user as the `blue` participant, and notifies the room via WebSocket. |
| `POST` | `/api/trial-tests/coop/invites/{invite_id}/decline` | Authenticated | Declines a pending co-op invitation. |
| `GET` | `/api/trial-tests/coop/session/{session_id}/ws-token` | Authenticated | Issues a short-lived HMAC ticket for `/ws/trial-tests/coop/{session_id}`. |
| `WS` | `/ws/trial-tests/coop/{session_id}` | WS Ticket | Bidirectional WebSocket channel for real-time co-op answer synchronization and lifecycle events. |

### 2.6 Live Classroom Quizzes ([`bot/routes/quizzes.py`](../../bot/routes/quizzes.py), [`bot/routes/quiz_game.py`](../../bot/routes/quiz_game.py))

#### Quiz Templates (`bot/routes/quizzes.py`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/quizzes` | Authenticated | Lists quizzes created by the user or public quizzes. |
| `GET` | `/api/quizzes/{quiz_id}` | Authenticated | Fetches quiz metadata. |
| `GET` | `/api/quizzes/{quiz_id}/questions` | Authenticated | Lists questions in a quiz template. |
| `GET` | `/api/quizzes/{quiz_id}/sessions` | Authenticated | Lists historical live sessions hosted for `quiz_id`. |
| `POST` | `/api/quizzes` | Authenticated | Creates a new quiz template. |
| `PUT` | `/api/quizzes/{quiz_id}` | Authenticated | Updates quiz metadata (`title`, `description`, `is_public`, `mode`). |
| `POST` | `/api/quizzes/{quiz_id}/fork` | Authenticated | Clones an existing quiz template into the user's library. |
| `DELETE` | `/api/quizzes/{quiz_id}` | Authenticated | Deletes a quiz template owned by the user. |
| `POST` | `/api/quizzes/{quiz_id}/questions` | Authenticated | Adds a question to a quiz template. |
| `PUT` | `/api/quizzes/{quiz_id}/questions/{question_id}` | Authenticated | Updates a quiz question. |
| `DELETE` | `/api/quizzes/{quiz_id}/questions/{question_id}` | Authenticated | Deletes a quiz question. |

#### Live Quiz Sessions (`bot/routes/quiz_game.py`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/quiz-sessions` | Authenticated | Creates a live quiz session with a 6-digit `pin_code` and snapshots questions into `quiz_session_questions`. |
| `GET` | `/api/quiz-sessions/pin/{pin_code}` | Public (Rate-limited) | Looks up an active quiz session by 6-digit PIN (enforces DB quota in `quiz_entry_limits`). |
| `POST` | `/api/quiz-sessions/join` | Optional Auth | Joins a live quiz session by PIN and nickname (enforces DB quota in `quiz_entry_limits`). |
| `POST` | `/api/quiz-sessions/{session_id}/claim` | Authenticated | Links an anonymous quiz participant record to an authenticated user account. |
| `GET` | `/api/quiz-sessions/{session_id}/review` | Optional Auth | Fetches post-game review data for a participant. |
| `POST` | `/api/quiz-sessions/{session_id}/review/answers` | Optional Auth | Submits self-paced review answers. |
| `PATCH` | `/api/quiz-sessions/{session_id}/avatar` | Optional Auth | Updates a participant's lobby avatar. |
| `GET` | `/api/quiz-sessions/{session_id}` | Optional Auth | Fetches live session status, current question index, and participant list. |
| `POST` | `/api/quiz-sessions/{session_id}/start` | Authenticated (Host) | Starts the live quiz session and broadcasts `quiz_started`. |
| `POST` | `/api/quiz-sessions/{session_id}/finish` | Authenticated (Host) | Ends the live quiz session early or at completion. |
| `GET` | `/api/quiz-sessions/{session_id}/questions` | Optional Auth | Lists session questions (sanitized for participants while in progress). |
| `GET` | `/api/quiz-sessions/{session_id}/progress` | Authenticated (Host) | Returns real-time matrix of participant answers per question for the teacher dashboard. |
| `POST` | `/api/quiz-sessions/{session_id}/current-question` | Authenticated (Host) | Jumps to a specific question index in teacher-paced mode. |
| `POST` | `/api/quiz-sessions/{session_id}/next` | Authenticated (Host) | Advances to the next question in teacher-paced mode. |
| `POST` | `/api/quiz-sessions/{session_id}/answers` | Optional Auth | Submits a participant's answer for a session question (`quiz_answers`). |
| `POST` | `/api/quiz-sessions/{session_id}/complete` | Optional Auth | Marks a participant's attempt as completed in self-paced mode. |
| `GET` | `/api/quiz-sessions/{session_id}/leaderboard` | Optional Auth | Returns current session leaderboard rankings. |
| `GET` | `/api/quiz-sessions/{session_id}/stats` | Optional Auth | Returns aggregate accuracy and timing statistics for the session. |
| `GET` | `/api/quiz-sessions/{session_id}/results` | Optional Auth | Returns detailed final results for a participant. |
| `GET` | `/api/quiz-sessions/user/history` | Authenticated | Lists past quiz sessions the user hosted or participated in. |
| `GET` | `/api/quiz-sessions/{session_id}/ws-token` | Optional Auth | Issues a short-lived HMAC ticket for `/ws/quiz/{session_id}`. |
| `WS` | `/ws/quiz/{session_id}` | WS Ticket | Real-time WebSocket channel for lobby updates, question transitions, and leaderboard broadcasts. |

### 2.7 Friends, Blocks & Presence ([`bot/routes/friends.py`](../../bot/routes/friends.py), [`bot/routes/presence.py`](../../bot/routes/presence.py))

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/friends/invites` | Authenticated | Creates a shareable friend invite link token (`friend_invites`). |
| `GET` | `/api/friends/invites` | Authenticated | Lists active friend invite links created by the user. |
| `GET` | `/api/friends/invites/{token}` | Optional Auth | Previews inviter metadata for a friend invite token. |
| `POST` | `/api/friends/invites/{token}/accept` | Authenticated | Accepts a friend invite token and creates a bidirectional friendship (`friendships`). |
| `POST` | `/api/friends/invites/{token}/revoke` | Authenticated | Revokes a friend invite token created by the user. |
| `GET` | `/api/friends` | Authenticated | Lists the user's friends with online status and streaks. |
| `DELETE` | `/api/friends/{friend_id}` | Authenticated | Removes a friend. |
| `GET` | `/api/friends/requests` | Authenticated | Lists incoming and outgoing friend requests (`friend_requests`). |
| `POST` | `/api/friends/requests` | Authenticated | Sends a direct friend request to `target_user_id`. |
| `GET` | `/api/friends/status` | Authenticated | Returns friendship/request/block status between the user and `target_user_id`. |
| `POST` | `/api/friends/requests/{request_id}/accept` | Authenticated | Accepts an incoming friend request. |
| `POST` | `/api/friends/requests/{request_id}/decline` | Authenticated | Declines an incoming friend request. |
| `DELETE` | `/api/friends/requests/{request_id}` | Authenticated | Cancels an outgoing friend request. |
| `POST` | `/api/friends/blocks` | Authenticated | Blocks a user (`blocks`) and removes any existing friendship/requests. |
| `DELETE` | `/api/friends/blocks/{blocked_id}` | Authenticated | Unblocks a user. |
| `GET` | `/api/friends/blocks` | Authenticated | Lists users blocked by the current user. |
| `POST` | `/api/presence/heartbeat` | Authenticated | Updates in-memory online presence timestamp for the user. |
| `GET` | `/api/presence/ws-token` | Authenticated | Issues a short-lived HMAC ticket for `/ws/presence`. |
| `WS` | `/ws/presence` | WS Ticket | Maintains live online presence via periodic WebSocket heartbeats. |

### 2.8 Student Problem Reports ([`bot/routes/reports.py`](../../bot/routes/reports.py))

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/reports` | Authenticated | Submits a student issue report for a curriculum task (`reports`). |
| `GET` | `/api/reports` | Authenticated | Lists curriculum task reports submitted by the current user. |
| `POST` | `/api/trial-test-reports` | Authenticated | Submits a student issue report for a trial test task (`trial_test_reports`). |
| `GET` | `/api/trial-test-reports` | Authenticated | Lists trial test task reports submitted by the current user. |

---

## 3. Admin HTTP Endpoints (`bot/routes/admin/`)

### 3.1 Admin Auth, Roles & Export ([`bot/routes/admin/auth.py`](../../bot/routes/admin/auth.py), [`bot/routes/admin/roles.py`](../../bot/routes/admin/roles.py), [`bot/routes/export.py`](../../bot/routes/export.py))

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/check` | Authenticated | Returns whether the user is an admin, their `admin_role`, and granted permissions array. |
| `POST` | `/api/admin/set-admin` | `roles.manage` | Grants or revokes admin status (`is_admin`, `admin_role`). |
| `POST` | `/api/admin/set-role` | `roles.manage` | Updates an admin user's role (`viewer`, `content_editor`, `reviewer`, `super_admin`). |
| `GET` | `/api/admin/roles` | `roles.manage` | Lists all admin users and roles. |
| `POST` | `/api/admin/roles` | `roles.manage` | Assigns an admin role to a user by email. |
| `POST` | `/api/admin/roles/restore` | Bootstrap `ADMIN_EMAIL` | Emergency self-restore endpoint allowing `ADMIN_EMAIL` to restore their `super_admin` role. |
| `GET` | `/api/export/admin/stats` | `super_admin` | Exports platform-wide analytics and table dumps. |

### 3.2 Centralized Question Bank (`/api/admin/bank/*` — [`bot/routes/admin/bank.py`](../../bot/routes/admin/bank.py))

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/bank/catalog` | `bank.view` | Returns topics catalog with active question counts (`q` search filter, `limit` `1`–`200`, default `100`). |
| `GET` | `/api/admin/bank/topics` | `bank.view` | Lists all bank topic tags (`bank_topics`). |
| `GET` | `/api/admin/bank/tasks` | `bank.view` | Paginated list of active bank tasks with filters (`search`, `difficulty`, `topic`, `answer_type`, `has_image`, `limit`, `offset`). |
| `GET` | `/api/admin/bank/tasks/trash` | `bank.view` | Paginated list of soft-deleted bank tasks (`deleted_at IS NOT NULL`). |
| `GET` | `/api/admin/bank/tasks/export` | `content_manage` | Exports all active bank tasks as JSON (`GET /api/admin/bank/tasks/export`). Note: Printable A4 PDF worksheets are generated client-side in the browser via [`web/lib/export-bank-worksheet.ts`](../../web/lib/export-bank-worksheet.ts). |
| `GET` | `/api/admin/bank/tasks/{task_id}` | `bank.view` | Fetches a single bank task with topics and metadata. |
| `POST` | `/api/admin/bank/tasks` | `bank.write` | Creates a new bank task (supports `multipart/form-data` image upload and near-duplicate confirmation). |
| `PUT` | `/api/admin/bank/tasks/{task_id}` | `bank.write` | Updates a bank task, records a snapshot in `bank_task_versions`, and syncs linked placements. |
| `DELETE` | `/api/admin/bank/tasks/{task_id}` | `bank.write` | Soft-deletes a bank task (`deleted_at = CURRENT_TIMESTAMP`). |
| `POST` | `/api/admin/bank/tasks/{task_id}/restore` | `bank.write` | Restores a soft-deleted bank task from trash. |
| `DELETE` | `/api/admin/bank/tasks/{task_id}/permanent` | `bank.permanent_delete` | Permanently deletes a soft-deleted bank task (`super_admin` only). |
| `POST` | `/api/admin/bank/tasks/similar` | `bank.write` | Runs trigram/SequenceMatcher deduplication check against existing bank tasks before save. |
| `POST` | `/api/admin/bank/tasks/import` | `bank.write` | Two-step bulk task import (`mode=preview` issues an HMAC preview token; `mode=confirm` validates the token and inserts tasks). |
| `GET` | `/api/admin/bank/tasks/{task_id}/usage` | `bank.view` | Lists all curriculum mini-lessons and trial tests where `task_id` is placed. |
| `GET` | `/api/admin/bank/tasks/{task_id}/versions` | `bank.view` | Lists version history snapshots (`bank_task_versions`) for `task_id`. |
| `GET` | `/api/admin/bank/tasks/{task_id}/versions/{version_no}` | `bank.view` | Fetches a specific historical version snapshot. |
| `DELETE` | `/api/admin/bank/tasks/{task_id}/versions/{version_no}` | `bank.permanent_delete` | Deletes a specific version history entry (`super_admin` only). |
| `POST` | `/api/admin/bank/tasks/{task_id}/rollback` | `bank.write` | Rolls a bank task back to a previous `version_no` and syncs placements. |
| `GET` | `/api/admin/bank/quality/summary` | `bank.view` | Returns counts of dead tasks (unused), topicless tasks, and potential duplicates. |
| `GET` | `/api/admin/bank/quality/dead` | `bank.view` | Lists active bank tasks not placed in any curriculum lesson or trial test. |
| `GET` | `/api/admin/bank/quality/no-topics` | `bank.view` | Lists active bank tasks without any assigned topic tags. |
| `GET` | `/api/admin/bank/quality/duplicates` | `bank.view` | Lists clusters of near-duplicate bank tasks. |
| `GET` | `/api/admin/bank/audit` | `audit.view` | Lists admin audit logs (`admin_audit_logs`) filtered to bank operations. |
| `GET` | `/api/admin/bank/unrecognized-answers` | `bank.view` | Lists frequent student answers that failed grading to assist content reviewers. |
| `POST` | `/api/admin/bank/tasks/{task_id}/accepted-answers` | `bank.write` | Appends an alternative accepted answer alias to a bank task. |

`GET /api/admin/bank/tasks` excludes twin tasks by default (`twins=exclude|only|include`); the trash list includes them. Task payloads carry `twin_source_id`, `twin_status`, `twin_count` (approved) and `twin_draft_count`.

#### Twin Tasks & AI Drafts ([`bot/routes/admin/bank_twins.py`](../../bot/routes/admin/bank_twins.py))

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/bank/tasks/{task_id}/twins` | Any admin | Lists a source task's twins (drafts included) with `twin_status`, `twin_origin`, `twin_ai_model` and `ai_check`. |
| `POST` | `/api/admin/bank/tasks/{task_id}/twins` | `content_manage` | Creates a manual twin (same form fields as bank task creation, plus `keep_source_image`). Refuses twins of twins, a changed question type, and an unchanged copy. |
| `GET` | `/api/admin/bank/ai-twins/status` | Any admin | `{enabled, model, drafts_per_request}`; never returns the provider URL or key. |
| `POST` | `/api/admin/bank/tasks/{task_id}/twins/ai-drafts` | `content_manage` (`20/hour`) | Asks the configured AI provider for 3 twins and stores valid ones as drafts. `503` when not configured, `400` for tasks with an image, `502`/`504` on provider errors. Returns `{items, skipped, model}`. |
| `POST` | `/api/admin/bank/tasks/{task_id}/ai-check` | `content_manage` (`120/hour`) | Re-solves a twin without its answer and stores `match`, `mismatch` or `error` with the checked version. |
| `POST` | `/api/admin/bank/tasks/{task_id}/approve` | `content_manage` | Approves a twin draft so mistake review can serve it (`409` if it is not a draft). |

### 3.3 Curriculum CMS ([`content_curriculum.py`](../../bot/routes/admin/content_curriculum.py), [`content_lessons.py`](../../bot/routes/admin/content_lessons.py), [`content_tasks.py`](../../bot/routes/admin/content_tasks.py))

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/modules` | `content.view` | Lists all curriculum modules for CMS editing. |
| `POST` | `/api/admin/modules` | `content.write` | Creates a new module. |
| `PUT` | `/api/admin/modules/{module_id}` | `content.write` | Updates a module. |
| `DELETE` | `/api/admin/modules/{module_id}` | `content.write` | Deletes a module. |
| `GET` | `/api/admin/modules/{module_id}/sections` | `content.view` | Lists sections in a module. |
| `POST` | `/api/admin/modules/{module_id}/sections` | `content.write` | Creates a section in a module. |
| `PUT` | `/api/admin/sections/{section_id}` | `content.write` | Updates a section. |
| `DELETE` | `/api/admin/sections/{section_id}` | `content.write` | Deletes a section. |
| `GET` | `/api/admin/sections/{section_id}/tasks` | `content.view` | Lists tasks directly attached to a section. |
| `POST` | `/api/admin/sections/{section_id}/tasks` | `content.write` | Creates a task in a section. |
| `GET` | `/api/admin/sections/{section_id}/lessons` | `content.view` | Lists lessons in a section. |
| `POST` | `/api/admin/sections/{section_id}/lessons` | `content.write` | Creates a lesson (and auto-initializes its 4 mini-lessons). |
| `PUT` | `/api/admin/lessons/{lesson_id}` | `content.write` | Updates a lesson. |
| `DELETE` | `/api/admin/lessons/{lesson_id}` | `content.write` | Deletes a lesson. |
| `GET` | `/api/admin/lessons/{lesson_id}/mini-lessons` | `content.view` | Lists the 4 mini-lessons for a lesson. |
| `PUT` | `/api/admin/mini-lessons/{mini_lesson_id}` | `content.write` | Updates a mini-lesson title/order. |
| `GET` | `/api/admin/mini-lessons/{mini_lesson_id}/tasks` | `content.view` | Lists tasks placed in a mini-lesson, each with `twin_count` (approved twins of its bank task). |
| `POST` | `/api/admin/mini-lessons/{mini_lesson_id}/tasks` | `content.write` | Places a bank task or creates a new task inside a mini-lesson. |
| `PUT` / `POST` | `/api/admin/mini-lessons/{mini_lesson_id}/tasks/reorder` | `content.write` | Reorders tasks within a mini-lesson. |
| `GET` | `/api/admin/tasks` | `content.view` | Lists curriculum tasks with optional filters. |
| `POST` | `/api/admin/task-answer/preview-check` | `content.view` | Tests whether a sample student answer matches an expected answer via `answers_equivalent`. |
| `POST` | `/api/admin/tasks` | `content.write` | Creates a curriculum task (and linked bank task). |
| `PUT` | `/api/admin/tasks/{task_id}` | `content.write` | Updates a curriculum task. |
| `DELETE` | `/api/admin/tasks/{task_id}` | `content.write` | Soft-deletes or removes a curriculum task placement. |
| `GET` | `/api/admin/tasks/trash` | `content.view` | Lists soft-deleted curriculum tasks. |
| `POST` | `/api/admin/tasks/{task_id}/restore` | `content.write` | Restores a soft-deleted curriculum task. |
| `POST` | `/api/admin/tasks/trash/empty` | `tasks.permanent_delete` | Permanently purges all trashed curriculum tasks (`super_admin` only). |
| `POST` | `/api/admin/tasks/reset-id-counter` | `tasks.permanent_delete` | Resets the `tasks` auto-increment sequence when the table is empty (`super_admin` only). |

### 3.4 Trial Test CMS ([`bot/routes/admin/trial_tests.py`](../../bot/routes/admin/trial_tests.py))

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/trial-tests/folders` | `content.view` | Lists the admin folder tree (`trial_test_folders`) and unfiled tests. |
| `POST` | `/api/admin/trial-tests/folders` | `trial_tests.write` | Creates a new trial test folder (`name`, `parent_id`, `category`, `sort_order`). |
| `PATCH` | `/api/admin/trial-tests/folders/{folder_id}` | `trial_tests.write` | Updates a folder's name, parent folder, or sort order (validates against cycles). |
| `DELETE` | `/api/admin/trial-tests/folders/{folder_id}` | `trial_tests.write` | Deletes an empty folder (returns `409 Conflict` if it still contains child folders or tests). |
| `GET` | `/api/admin/trial-tests` | `content.view` | Lists all trial tests (including unpublished drafts) for admin management. |
| `GET` | `/api/admin/trial-tests/categories` | `content.view` | Lists distinct trial test categories. |
| `POST` | `/api/admin/trial-tests` | `trial_tests.write` | Creates a new trial test template. |
| `PUT` | `/api/admin/trial-tests/{test_id}` | `trial_tests.write` | Updates trial test metadata (`title`, `category`, `folder_id`, `is_published`, `expected_tasks_count`). |
| `DELETE` | `/api/admin/trial-tests/{test_id}` | `trial_tests.write` | Deletes a trial test template. |
| `GET` | `/api/admin/trial-tests/{test_id}/tasks` | `content.view` | Lists all task slots (`trial_test_tasks`) in `test_id`. |
| `PUT` | `/api/admin/trial-tests/{test_id}/slots/{slot_index}` | `trial_tests.write` | Assigns or updates a specific 0-based exam slot (`0`–`39`). |
| `DELETE` | `/api/admin/trial-tests/{test_id}/slots/{slot_index}` | `trial_tests.write` | Clears a specific exam slot. |
| `POST` | `/api/admin/trial-tests/{test_id}/tasks/create` | `trial_tests.write` | Creates a new bank task and places it into `test_id`. |
| `PUT` | `/api/admin/trial-tests/{test_id}/tasks/{task_id}` | `trial_tests.write` | Updates a trial test task placement. |
| `POST` | `/api/admin/trial-tests/{test_id}/tasks/{task_id}/update` | `trial_tests.write` | Multipart form alternative for updating a trial test task with an image. |
| `DELETE` | `/api/admin/trial-tests/{test_id}/tasks/{task_id}` | `trial_tests.write` | Removes a task placement from `test_id`. |
| `POST` | `/api/admin/trial-tests/{test_id}/tasks/from-bank` | `trial_tests.write` | Places one or more existing bank tasks into `test_id`. |

### 3.5 Reports, Statistics & Operations ([`reports.py`](../../bot/routes/admin/reports.py), [`statistics.py`](../../bot/routes/admin/statistics.py), [`ops.py`](../../bot/routes/admin/ops.py))

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/reports` | `reports.view` | Lists student curriculum task reports (`status` filter). |
| `GET` | `/api/admin/trial-test-reports` | `reports.view` | Lists student trial test task reports (`status` filter). |
| `PUT` | `/api/admin/reports/{report_id}/status` | `reports.update` | Updates curriculum report status (`pending`, `resolved`, `dismissed`). |
| `PUT` | `/api/admin/trial-test-reports/{report_id}/status` | `reports.update` | Updates trial test report status. |
| `PUT` | `/api/admin/reports/tasks/{task_id}` | `reports.update` | Quick-edits a curriculum task directly from a problem report. |
| `DELETE` | `/api/admin/reports/{report_id}` | `reports.update` | Deletes a curriculum task report. |
| `DELETE` | `/api/admin/trial-test-reports/{report_id}` | `reports.update` | Deletes a trial test task report. |
| `GET` | `/api/admin/statistics` | `stats.view` | Returns DAU/WAU/MAU, retention cohorts, hardest tasks, and activity analytics. |
| `GET` | `/api/admin/mistake-analytics` | Any admin | First-attempt mistakes in module lessons (`period=7d\|30d\|all`, optional `module_id`): summary, top 50 tasks with review outcomes and twin counts, topics, and up to 100 students by weak spots. E-mail addresses only for `super_admin` ([`mistake_analytics.py`](../../bot/routes/admin/mistake_analytics.py)). |
| `GET` | `/api/admin/ops/health/summary` | `ops.view` | Returns live operational health status, latency `p95`, error rate, DB status, and online count. |
| `GET` | `/api/admin/ops/health/timeseries` | `ops.view` | Returns historical time-series samples from `ops_health_samples` (`range=1h\|24h\|7d`). |
| `GET` | `/api/admin/ops/incidents` | `ops.view` | Lists open and resolved operational incidents from `ops_incidents`. |
