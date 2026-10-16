"""Checksum-verified, transactional PostgreSQL migrations for Neon.

Use a direct DATABASE_MIGRATION_URL for release-time migrations. The pooled
DATABASE_URL is suitable for the application's short-lived connections.
"""
from hashlib import sha256
from pathlib import Path

MIGRATION_LOCK_ID = 724831922


def run_postgres_migrations(url: str) -> None:
    import psycopg
    from storage import postgres_options

    with psycopg.connect(url, prepare_threshold=None, options=postgres_options(url)) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK_ID,))
            cursor.execute("""CREATE TABLE IF NOT EXISTS mathbot_schema_migrations (
                version text PRIMARY KEY,
                checksum text NOT NULL,
                applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            for migration in sorted((Path(__file__).parent / "postgres").glob("*.sql")):
                source = migration.read_text(encoding="utf-8")
                checksum = sha256(source.encode()).hexdigest()
                cursor.execute("SELECT checksum FROM mathbot_schema_migrations WHERE version = %s", (migration.stem,))
                existing = cursor.fetchone()
                if existing:
                    if existing[0] != checksum:
                        raise RuntimeError(f"Applied PostgreSQL migration changed: {migration.name}")
                    continue
                cursor.execute(source)
                cursor.execute("INSERT INTO mathbot_schema_migrations (version, checksum) VALUES (%s, %s)",
                               (migration.stem, checksum))
