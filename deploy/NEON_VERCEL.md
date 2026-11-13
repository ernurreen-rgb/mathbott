# QazMath: Vercel + Neon

The web app is the Vercel project `qazmath` (root directory `web`).
The FastAPI app is `qazmath-api` (root directory `bot`, entrypoint `main:app`).
Neon project `mathbot-neon` provides PostgreSQL and the private S3-compatible
bucket `mathbot-images`. The API runs in Vercel region `cle1`, alongside Neon
in AWS Ohio. No VPS is required for this configuration.

## Runtime configuration

The web application uses Node.js 24 LTS. The repository `.nvmrc` selects the
major version for local development and GitHub Actions; `web/package.json`
declares `engines.node=24.x` for Vercel builds and functions. Both web Docker
images use `node:24-alpine`. Select Node 24 in your version manager before
running `npm ci` from `web/`. Minor and patch releases may differ by provider.
The production web container starts Next.js directly with Node and removes
the global npm/npx installation after installing its locked dependencies.
The builder and development images retain npm for compilation and development.
Docker source-map uploads receive `SENTRY_AUTH_TOKEN` through a BuildKit secret,
not a build argument. For a local image build with uploads, use
`docker build --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN -t mathbot-web ./web`
from the repository root. The secret is optional when uploads are disabled.

Copy variable names from `bot/.env.example` and `web/.env.example`.
Keep secrets in Vercel environment variables or ignored local `.env` files.
Never use the `NEXT_PUBLIC_` prefix for database URLs, storage keys, OAuth
client secrets, or the internal proxy shared secret.

Backend production settings:

| Variable | Value / purpose |
| --- | --- |
| `DATABASE_URL` | Neon pooled PostgreSQL URL; provided by the Vercel integration |
| `ENVIRONMENT` | `production` |
| `ALLOWED_ORIGINS` | `https://qazmath.vercel.app` |
| `INTERNAL_PROXY_SHARED_SECRET` | Same random secret as the web project |
| `IMAGE_STORAGE_BACKEND` | `s3` |
| `S3_BUCKET` | `mathbot-images` |
| `S3_ENDPOINT_URL` | Endpoint from the Neon branch's Storage connection panel |
| `S3_REGION` | `us-east-2` for the current branch |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Existing storage credentials from Neon |
| `IMAGE_UPLOAD_MAX_BYTES` | `4194304` (4 MiB; leaves room for multipart framing on Vercel) |
| `CRON_SECRET` | Random bearer secret for scheduled maintenance |
| `DATABASE_AUTO_MIGRATE` | `false` |
| `BACKGROUND_TASKS_ENABLED` | `false` |
| `ADMIN_EMAIL` | Optional bootstrap `super_admin` email |
| `IMPORT_PREVIEW_TOKEN_SECRET` | Optional dedicated HMAC secret for bank JSON import preview tokens (falls back to `INTERNAL_PROXY_SHARED_SECRET`) |
| `SENTRY_DSN` | Optional Sentry DSN for backend error/trace reporting |
| `ALERTS_ENABLED`, `ALERT_TELEGRAM_ENABLED`, `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` | Optional Telegram operational alert settings |
| `AI_TWIN_BASE_URL`, `AI_TWIN_API_KEY`, `AI_TWIN_MODEL` | Optional; enable AI twin drafts in the bank (see [AI twin drafts](#ai-twin-drafts)) |

Web production settings:

- `BACKEND_URL`: the API project's verified production domain, without `/api`.
- `NEXT_PUBLIC_API_URL=/api/backend`.
- `NEXT_PUBLIC_REALTIME_TRANSPORT=polling`.
- `NEXTAUTH_URL=https://qazmath.vercel.app`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`.
- The same `INTERNAL_PROXY_SHARED_SECRET` as the API project.

Google OAuth must allow the redirect URI
`https://qazmath.vercel.app/api/auth/callback/google`.

## Database migration

Run commands from `bot/` with the backend dependencies installed. Store the
direct connection URL in `DATABASE_MIGRATION_URL`, and the pooled URL in
`DATABASE_URL`. Both must address the same Neon database and branch.

```powershell
python scripts/migrate_to_neon.py
```

This applies the pending PostgreSQL migrations from `bot/migrations/postgres/`
and the idempotent startup seeds. Migrations are ordered and checksum-verified:
add a new numbered SQL file for every schema change and never rewrite an
applied one. `--schema-only`, used in older instructions, is still accepted and
does the same.

The data was imported once from the old SQLite database at the first
deployment. SQLite support and that importer (`bot/migrations/sqlite_to_postgres.py`)
were removed on 2026-11-12; both remain in git history up to commit `bd3bdef`.
Ignored deployment scratch files under `bot/.vercel/` include the initial
migration snapshot and its count/checksum report on the machine that performed
the first deployment; they are not source-controlled backups.

## Backups and restore drills

For a consistent PostgreSQL backup and a restore drill into a separate empty
database, follow [PostgreSQL backup/restore](POSTGRES_BACKUP_RESTORE.md). This
uses direct connections and read-only exported source snapshots; it never
restores over the production database. S3 object bytes are handled separately.

## Quiz entry protection

Apply the schema-only migration before deploying this API version:

```powershell
# From bot/, with DATABASE_MIGRATION_URL pointing to the same database as runtime.
python scripts/migrate_to_neon.py
```

This adds `quiz_entry_limits` through PostgreSQL `0006` (and subsequent schema migrations such as `trial_test_folders` in PostgreSQL `0007`);
it does not change existing quiz participants or scores. Runtimes with
auto-migration (the default outside Vercel) apply it at startup. Hosted runtimes
with auto-migration disabled must migrate explicitly. Deploy the API after the schema, then the web app.

The database shares fixed 60-second entry budgets across workers. Defaults are
1200 lookup/join requests, 30 distinct PINs and 300 newly created participants
per network per window, with a server room cap of 500 participants. Repeated
lookups of the same PIN do not consume another distinct-PIN allowance. A valid
token/account resume does not create another participant or consume a new-slot
allowance. All entry requests still count toward the total request budget.

The backend settings are `QUIZ_ENTRY_REQUESTS_PER_MINUTE`,
`QUIZ_ENTRY_DISTINCT_PINS_PER_MINUTE`, `QUIZ_ENTRY_NEW_PARTICIPANTS_PER_MINUTE`
and `QUIZ_MAX_PARTICIPANTS`. They accept positive bounded integers; use the
same values on every instance. Client-provided session settings cannot raise
the server room cap. Denials return 429 with `Retry-After`; a full room returns
409. Existing over-capacity rooms are retained and their owned participants can
resume; new participants cannot join until below the cap.

The web proxy creates an HMAC network key and binds it to the signed request's
timestamp, nonce and V2 signature. Vercel uses its owned
`x-vercel-forwarded-for` header, following the
[Vercel request-header contract](https://vercel.com/docs/headers/request-headers).
IPv4-mapped IPv6 is normalized as IPv4; other IPv6 clients share a /64 budget.
No raw IP address is stored in the quota table.

For self-hosting, set web-server `TRUSTED_CLIENT_IP_HEADER=x-real-ip` only if
the ingress overwrites that header and direct access to Next.js is prevented.
The tracked nginx examples overwrite it from the connecting peer. For another
ingress, configure an owned header first; arbitrary browser XFF is not trusted.
Missing, malformed or unconfigured ingress identity uses one shared, bounded
fallback bucket. An older signed V2 web proxy without the new network claim
uses the same fallback, so API-first rollout remains possible. This fallback
reduces network isolation; deploy/configure the web proxy promptly.

Production lookup/join requires trusted proxy V2 provenance, while Google
authentication remains optional for guests. Direct unsigned backend entry is
rejected. Other guest capability endpoints retain their existing access rules.
Quota rows expire after an hour of inactivity and are removed opportunistically
and by maintenance. These application admission budgets do not configure
provider/ingress traffic filtering.

## Mistake review and twin tasks

PostgreSQL `0008_module_review` adds `bank_task_twins`,
`module_review_attempts` and the `idx_solutions_user_task_id` index; `0009_ai_twin_checks`
adds the AI draft and check columns to `bank_task_twins`. Both only
add objects, so the API that is already running keeps working with them. As with
every schema release, apply them before deploying the API that needs them:

```powershell
# From bot/, with DATABASE_MIGRATION_URL pointing to the same database as runtime.
python scripts/migrate_to_neon.py
```

The web proxy treats `/api/mini-lessons` as an identity path and allows functions
to run for 60 seconds (`maxDuration`), matching the API function in `bot/vercel.json`.

## AI twin drafts

Teachers can ask an AI provider for three number-only twin drafts of a bank task.
Any provider with an OpenAI-compatible Chat Completions API and JSON mode works.
The feature stays off until all three variables are set on the **API** project
(`qazmath-api`), and the key never reaches the browser:

| Variable | Example |
| --- | --- |
| `AI_TWIN_BASE_URL` | `https://api.openai.com/v1`, `https://api.deepseek.com/v1`, `https://openrouter.ai/api/v1`, `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_TWIN_API_KEY` | The provider's API key |
| `AI_TWIN_MODEL` | A model id of that provider that supports `response_format: {"type": "json_object"}` |

Redeploy the API after changing them. One press of the button costs four model
calls (one generation, three independent re-solves). Requests time out after
`AI_TWIN_TIMEOUT_SECONDS` (default `45`, at most `55`) to stay inside the 60-second
function limit; per-admin limits are 20 generations and 120 checks per hour.
Drafts are stored with `status = 'draft'` and are never served to students until a
teacher approves them in the bank's **Twins** tab.

## Images

The bucket stays private. The API reads and validates image keys and serves
the bytes through `/api/images/{filename}`; existing image URLs continue to
work through the authenticated web proxy. Storage credentials never reach the
browser.

```powershell
python scripts/upload_images.py --source ../images
python scripts/upload_images.py --source ../images --apply
```

Configure the `S3_*` variables before applying. The uploader preserves filenames
and refuses to overwrite an object with different content. Historical images
remain available for content rollback.

## Serverless behavior

- Cold starts open connections but do not run schema migrations or full-table
  seed updates. Migrate explicitly before deploying an API version that needs
  a new schema.
- PostgreSQL uses psycopg through the async storage boundary; placeholders,
  generated IDs, upserts, UTC dates and existing API row shapes are preserved.
  Floating-point values are `DOUBLE PRECISION`, preserving quiz clocks and
  score timing.
- Critical quiz, role and task-completion transactions use a transaction-scoped database
  advisory lock, which coordinates independent function instances.
- Learning progress stores unique completions, solved counts and streaks. The
  `0003_remove_learning_points` PostgreSQL migration preserves that history and
  quiz scores while retiring learning-point balances and their achievement.
- Quiz state already has HTTP polling. Hosted web builds
  use polling, and user presence uses a shared database heartbeat with a
  70-second expiry instead of instance-local WebSocket membership.
- `/api/maintenance` requires `Authorization: Bearer <CRON_SECRET>`. Vercel's
  daily cron runs at `22:00 UTC` / `03:00 Asia/Qyzylorda`. PostgreSQL/Neon owns
  autovacuum. Background loops remain available for a conventional local/VPS
  process.
- Request latency/error metrics remain process-local. For fleet-wide alerting,
  use Vercel observability or a shared monitoring service; the daily maintenance
  invocation does not replace a continuous fleet-wide monitor.

## Quiz request budget

Players receive session details, their current question and their score from
one `/progress` request every four seconds while the tab is visible. The
class roster is included only in the lobby. During play the API reads just
the current question snapshot instead of loading every frozen question.
Completed players receive their rank as a number and keep refreshing until
the host finishes, so later answers can still change their place.

Answer responses include the persisted progress from the same transaction.
Successful answer and next-question actions need no follow-up reads. Failed
answers can still be reconciled or retried without awarding points twice.
The browser supports older API responses during deployment by falling back
to the previous read endpoints.

Quiz polling and WebSocket connections pause in hidden tabs and recover
immediately when the tab becomes visible. Player polling stops on the final
game status; host polling stops once the final report has loaded. Polling
deployments skip leaderboard queries for broadcasts with no WebSocket audience.

For 200 visible player tabs over ten minutes, the periodic quiz state reads
decrease from approximately 60,000 to 30,000 API requests. With the current
Next.js proxy this corresponds to about 120,000 versus 60,000 Vercel function
invocations. These are arithmetic estimates, not load-test results or a
capacity guarantee. Joining, activating questions, answers, host updates,
presence and retries are additional traffic. The polling optimization itself
requires no schema migration; the quiz-entry protection above requires its
schema-only migration before the API deployment.

## Verification and deployment

Legacy automated test suites (`web/e2e/*`, Jest unit suites, and the 51-file backend `pytest` suite) were removed on 2026-11-05 (`b201538`). Targeted backend tests live in `bot/tests/` (bank catalog, mistake review, AI twin drafts with a fake provider, mistake analytics) and run against disposable PostgreSQL databases on the `TEST_DATABASE_URL` server; `httpx` is installed only for tests. CI checks Python
syntax and lint, runs `python -m pytest tests`, checks frontend lint/TypeScript/build, and dependency security.

```powershell
# From bot/
python -m compileall -q .
flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
python -m pip install pytest "httpx==0.28.1"   # test-only tools, once
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"   # disposable server
python -m pytest tests

# From web/
npm run lint
npm run typecheck
npm run build
```

Deploy the API first, verify `/api/health`, then update the web project's
`BACKEND_URL` to its verified production domain and deploy the web app. Check
the public catalogue, authentication, private proxy rejection, and an image
round trip after the deployment.

```powershell
# In bot/
vercel deploy --prod --yes
# In web/
vercel deploy --prod --yes
```

There is no SQLite rollback path any more: SQLite support was removed on
2026-11-12. Roll back by redeploying an earlier API version against the same
Neon database, and restore data only through the
[PostgreSQL backup/restore](POSTGRES_BACKUP_RESTORE.md) drill.
