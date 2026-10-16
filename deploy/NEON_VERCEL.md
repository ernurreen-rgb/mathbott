# QazMath: Vercel + Neon

The web app is the Vercel project `qazmath` (root directory `web`).
The FastAPI app is `qazmath-api` (root directory `bot`, entrypoint `main:app`).
Neon project `mathbot-neon` provides PostgreSQL and the private S3-compatible
bucket `mathbot-images`. The API runs in Vercel region `cle1`, alongside Neon
in AWS Ohio. No VPS is required for this configuration.

## Runtime configuration

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
python scripts/migrate_to_neon.py --source mathbot.db
python scripts/migrate_to_neon.py --source mathbot.db --apply --archive-legacy
```

The first command is a plan. The second takes an online SQLite backup,
including committed WAL changes, and imports that snapshot into an empty
PostgreSQL database. It never updates the source SQLite file.

The importer refuses to overwrite existing application rows. All application
rows, archive records, sequence resets and constraint checks use one database
transaction. Row counts and order-independent content checksums must match
before it commits. Foreign-key violations in active application tables stop
the import.

Older databases can contain retired tables and columns. `--archive-legacy`
preserves their original schemas and complete rows in
`mathbot_legacy_archive`; it does not discard them. Entries with `row_number=0`
contain the original table DDL, and positive row numbers contain JSON records.

Keep an independent backup of the original SQLite database before switching
traffic. Ignored deployment scratch files under `bot/.vercel/` include the
initial migration snapshot and its count/checksum report on the machine that
performed the first deployment; they are not source-controlled backups.

For later schema-only releases:

```powershell
python scripts/migrate_to_neon.py --schema-only
```

SQLite keeps its Alembic migrations. PostgreSQL has ordered, checksum-verified
SQL migrations in `bot/migrations/postgres/`. Add a new PostgreSQL migration
for schema changes; never rewrite an applied SQL file. The baseline generator
in `scripts/generate_postgres_schema.py` is a development utility for the
initial baseline, not a release migration command.

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
  SQLite `REAL` values become PostgreSQL `DOUBLE PRECISION`, preserving quiz
  clocks and score timing.
- Critical quiz, role and reward transactions use a transaction-scoped database
  advisory lock, which coordinates independent function instances.
- Quiz and cooperative test state already have HTTP polling. Hosted web builds
  use polling, and user presence uses a shared database heartbeat with a
  70-second expiry instead of instance-local WebSocket membership.
- `/api/maintenance` requires `Authorization: Bearer <CRON_SECRET>`. Vercel's
  daily cron runs at `22:00 UTC` / `03:00 Asia/Qyzylorda`. PostgreSQL/Neon owns
  autovacuum. Background loops remain available for a conventional local/VPS
  process.
- Request latency/error metrics remain process-local. For fleet-wide alerting,
  use Vercel observability or a shared monitoring service; the daily maintenance
  invocation does not replace a continuous fleet-wide monitor.

## Verification and deployment

```powershell
# SQLite regression suite
python -m pytest tests/ -q

# A disposable PostgreSQL database, never the production URL
$env:MATHBOT_TEST_DATABASE_URL = 'postgresql://user:password@localhost:5432/mathbot_test'
python -m pytest tests/ -q
```

PostgreSQL tests create and remove isolated test schemas. CI runs the backend
suite against both SQLite and PostgreSQL 17. Frontend changes need TypeScript
checking and the relevant Jest tests.

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

The old SQLite backend and its database are retained for rollback. After the
new site accepts writes, reconcile those PostgreSQL writes before switching
traffic back to SQLite; an older snapshot cannot contain newer results.
