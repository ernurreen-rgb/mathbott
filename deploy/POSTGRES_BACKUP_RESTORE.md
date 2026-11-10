# PostgreSQL backup and restore drill

Run `bot/scripts/postgres_backup.py` with the backend Python dependencies and
PostgreSQL clients installed. Use the same PostgreSQL major version as the
source when possible. `pg_dump` must not be older than the source server, and
the restore server/client must not be older than the dump client. The production
drill on 2026-11-02 used PostgreSQL **18.6** throughout.

The tool reads only explicitly supplied environment variables. It does not load
`.env` files and never falls back to `DATABASE_URL`. Connection URLs and passwords
are passed to clients through their libpq environment variables, not argv/logs.
Neon requires its **direct/unpooled** endpoint for this workflow.

## Create a backup

Inject the direct source URL from the secret store as
`MATHBOT_BACKUP_SOURCE_URL`. If a trusted shell already contains the direct
`DATABASE_MIGRATION_URL`, PowerShell can copy it without printing its value:

```powershell
$env:MATHBOT_BACKUP_SOURCE_URL = $env:DATABASE_MIGRATION_URL
python bot/scripts/postgres_backup.py backup --output C:\private-backups\snapshot-20261102
```

If PostgreSQL clients are not on PATH, put `--pg-bin` **before** the subcommand:

```powershell
python bot/scripts/postgres_backup.py --pg-bin 'C:\Program Files\PostgreSQL\18\bin' backup --output C:\private-backups\snapshot-20261102
```

The output directory must be new. Keep it in a private location outside the
checkout. On Windows, use a parent with restricted ACLs; POSIX directory/file
modes alone do not restrict Windows access. The tool creates:

- `database.dump`: PostgreSQL custom-format archive of the entire `public` schema.
- `manifest.json`: archive SHA-256, exported snapshot time, schema/content
  fingerprints, and all current migration checksums in `bot/migrations/postgres/` (seven migrations as of `0007_trial_test_folders`; six at the time of the 2026-11-02 drill). No source URL/password.

The exporter holds a **REPEATABLE READ, READ ONLY** transaction open, exports its
snapshot and uses that same snapshot for `pg_dump --snapshot` and row fingerprints.
Live writes can continue. Table row order is canonicalized using the C collation;
column position checks ignore physical gaps left by dropped columns. Failed or
interrupted output without a completed manifest is not a valid bundle. Existing
directories are never overwritten, including incomplete attempts.

The database archive contains application data. `backups/` and `*.dump` are
gitignored, but the operational copy should remain outside Git. CI uses only
synthetic databases and uploads only its JUnit report.

## Restore into a separate empty database

Create a **new** database on an isolated server/Neon test branch. Its name must
match `mathbot_restore_[a-z0-9_]+`, for example `mathbot_restore_20261102`. Keep
the default empty `public` schema. Use an owner role with permission to create
the restored objects, and inject that database's direct URL as
`MATHBOT_RESTORE_TARGET_URL`. The script does not create/drop databases.

First run the read-only preflight:

```powershell
python bot/scripts/postgres_backup.py restore --backup C:\private-backups\snapshot-20261102
```

It verifies the archive digest, target name, source/target distinction, server
version and absence of user relations/functions. Even an existing empty table
causes refusal. It does not seed or migrate the target.

Then apply the already reviewed bundle to that empty target:

```powershell
python bot/scripts/postgres_backup.py restore --backup C:\private-backups\snapshot-20261102 --apply
```

`pg_restore` uses `--single-transaction --exit-on-error --no-owner --no-privileges
--no-tablespaces`. No `--clean` or `--create` is used. Only the public-schema
creation TOC entry is omitted because the fresh target already has that schema.
An error rolls back the restore transaction, including earlier DDL/data. A second
restore to the now populated target is refused.

After restoration the tool checks every table's row count/content digest, schema
definitions (columns, constraints, indexes, functions, views, triggers, sequence
definitions), local migration checksums and identity/serial sequence positions.
It reads source/target only for verification. A post-restore verification failure
leaves the target isolated for inspection; it does not delete or repair anything.
The test database must remain offline while the drill runs. Client/database
exception details are suppressed to prevent credentials/data entering logs.

## Manual restore verification

Automated regression suites and the CI restore job were removed on 2026-11-05.
Use the backup and restore commands above against a new, isolated empty target
when a recovery drill is needed. The restore tool still verifies archive,
schema/content/migration checksums and sequence positions, and refuses to
overwrite an existing target. Historical drill results below remain evidence of
the release at that date.

## Scope and recorded production drill

The 2026-11-02 production snapshot restored **44 tables / 2,155 rows**, with
matching schema/data/migration checksums and **38 sequence positions**. A new user
ID was generated only in the restored database and its insert was rolled back.
The source had no writes. The local restore server was authenticated, bound to
loopback, kept in an ACL-restricted private directory and stopped after the drill.
The local restore server was authenticated, bound to loopback, kept in an ACL-restricted private directory and stopped after the drill.

This is a logical `public`-schema recovery drill. It does not include S3 image
bytes, database roles/ACLs/tablespaces, other schemas, provider point-in-time
recovery, scheduled/off-site backup retention, or a switch of production traffic.
S3 backup and regular retained backup storage require their own configuration.

Client contracts: [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html),
[official Ubuntu client packages](https://www.postgresql.org/download/linux/ubuntu/).
