"""Copy a consistent SQLite snapshot into an EMPTY PostgreSQL application DB.

The source is opened read-only and backed up through SQLite's online backup API
(including committed WAL data). The snapshot is upgraded, never the source.
All row copies, sequence resets and validation use one PostgreSQL transaction.
"""
from contextlib import closing
from pathlib import Path
import gc
import json
from base64 import b64encode
from decimal import Decimal
from hashlib import sha256
import sqlite3
import tempfile

from migrations.postgres_runner import run_postgres_migrations
from migrations.runner import run_migrations
from storage import is_postgres, postgres_options


def _json_value(value):
    if isinstance(value, bytes):
        return {"sqlite_blob_base64": b64encode(value).decode("ascii")}
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"Unsupported database value: {type(value).__name__}")


def _row_digest(rows):
    """Order-independent multiset checksum, including duplicate rows."""
    digest = 0
    for row in rows:
        encoded = json.dumps(list(row), ensure_ascii=False, default=_json_value, separators=(",", ":")).encode("utf-8")
        digest = (digest + int.from_bytes(sha256(encoded).digest(), "big")) % (1 << 256)
    return digest


def copy_sqlite_to_postgres(source: str, target: str, *, apply: bool = False, archive_legacy: bool = False) -> dict:
    import psycopg
    from psycopg import sql

    source_path = Path(source).resolve(strict=True)
    if not is_postgres(target):
        raise ValueError("The target must be a PostgreSQL connection URL")
    with tempfile.TemporaryDirectory(prefix="mathbot-db-copy-") as directory:
        snapshot_path = Path(directory) / "snapshot.db"
        with closing(sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True)) as original:
            with closing(sqlite3.connect(snapshot_path)) as snapshot:
                original.backup(snapshot)
        run_migrations(str(snapshot_path))
        reference_path = Path(directory) / "reference.db"
        run_migrations(str(reference_path))
        try:
            with closing(sqlite3.connect(reference_path)) as reference:
                current_tables = {row[0] for row in reference.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version'")}
                current_columns = {table: [row[1] for row in reference.execute(f'PRAGMA table_info("{table}")')]
                                   for table in current_tables}
            with closing(sqlite3.connect(snapshot_path)) as snapshot:
                problems = [row for row in snapshot.execute("PRAGMA foreign_key_check") if row[0] in current_tables]
                if problems:
                    # Table/row IDs are actionable without disclosing row contents.
                    raise ValueError(f"SQLite snapshot contains broken foreign keys: {problems}")
                all_tables = [row[0] for row in snapshot.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version' ORDER BY name")]
                tables = sorted(current_tables)
                legacy = {table: snapshot.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
                          for table in all_tables if table not in current_tables}
                legacy_columns = {table: [row[1] for row in snapshot.execute(f'PRAGMA table_info("{table}")')
                                           if row[1] not in current_columns[table]] for table in tables}
                legacy_columns = {table: columns for table, columns in legacy_columns.items() if columns}
                counts = {table: snapshot.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in tables}
                archive_tables = set(legacy) | set(legacy_columns)
                report = {"source": str(source_path), "applied": False, "tables": counts,
                          "total_rows": sum(counts.values()), "legacy_tables": legacy,
                          "legacy_columns": legacy_columns,
                          "legacy_rows": sum(legacy.get(table, counts.get(table, 0)) for table in archive_tables),
                          "legacy_archived": False}
                if not apply:
                    return report
                if archive_tables and not archive_legacy:
                    raise ValueError("Legacy tables/columns found; review the plan and use --archive-legacy to preserve them in mathbot_legacy_archive")
                run_postgres_migrations(target)
                with psycopg.connect(target, prepare_threshold=None, options=postgres_options(target)) as connection:
                    with connection.cursor() as cursor:
                        # Use the same write lock as repository transactions.
                        from storage import WRITE_LOCK_ID
                        cursor.execute("SELECT pg_advisory_xact_lock(%s)", (WRITE_LOCK_ID,))
                        cursor.execute("SELECT table_name FROM information_schema.tables "
                                       "WHERE table_schema=current_schema() AND table_type='BASE TABLE' "
                                       "AND table_name NOT IN ('mathbot_schema_migrations', 'mathbot_legacy_archive')")
                        target_tables = {row[0] for row in cursor.fetchall()}
                        if target_tables != set(tables):
                            raise ValueError("SQLite/PostgreSQL table sets differ; bring both schemas to the current revision")
                        # Lock every table before checking emptiness; an active API
                        # cannot create a row between this check and the import.
                        for table in tables:
                            cursor.execute(sql.SQL("LOCK TABLE {} IN ACCESS EXCLUSIVE MODE").format(sql.Identifier(table)))
                            cursor.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table)))
                            if cursor.fetchone()[0]:
                                raise ValueError(f"PostgreSQL table {table} is not empty; import refused")
                        if archive_tables:
                            cursor.execute("""CREATE TABLE IF NOT EXISTS mathbot_legacy_archive (
                                table_name text NOT NULL, row_number bigint NOT NULL,
                                original_schema_sql text, row_json text,
                                PRIMARY KEY (table_name, row_number)
                            )""")
                            cursor.execute("LOCK TABLE mathbot_legacy_archive IN ACCESS EXCLUSIVE MODE")
                            cursor.execute("SELECT COUNT(*) FROM mathbot_legacy_archive")
                            if cursor.fetchone()[0]:
                                raise ValueError("Legacy archive is not empty; import refused")
                            for table in sorted(archive_tables):
                                definition = snapshot.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()[0]
                                cursor.execute("INSERT INTO mathbot_legacy_archive VALUES (%s, 0, %s, NULL)", (table, definition))
                                selection = snapshot.execute(f'SELECT * FROM "{table}"')
                                columns = [column[0] for column in selection.description]
                                for number, row in enumerate(selection, 1):
                                    cursor.execute("INSERT INTO mathbot_legacy_archive VALUES (%s, %s, NULL, %s)",
                                                   (table, number, json.dumps(dict(zip(columns, row)), ensure_ascii=False, default=_json_value)))
                        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
                        for table in tables:
                            columns = current_columns[table]
                            selection_sql = 'SELECT ' + ', '.join('"' + column + '"' for column in columns) + f' FROM "{table}"'
                            selection = snapshot.execute(selection_sql)
                            insert = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                                sql.Identifier(table), sql.SQL(", ").join(map(sql.Identifier, columns)),
                                sql.SQL(", ").join(sql.Placeholder() for _ in columns))
                            while batch := selection.fetchmany(500):
                                cursor.executemany(insert, batch)
                            cursor.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table)))
                            if cursor.fetchone()[0] != counts[table]:
                                raise RuntimeError(f"Row count mismatch for {table}; import rolled back")
                            source_digest = _row_digest(snapshot.execute(selection_sql))
                            cursor.execute(sql.SQL("SELECT {} FROM {}").format(
                                sql.SQL(", ").join(map(sql.Identifier, columns)), sql.Identifier(table)))
                            if _row_digest(cursor) != source_digest:
                                raise RuntimeError(f"Content checksum mismatch for {table}; import rolled back")
                            if "id" in columns:
                                cursor.execute("SELECT pg_get_serial_sequence(%s, 'id')", (table,))
                                sequence = cursor.fetchone()[0]
                                if sequence:
                                    cursor.execute(sql.SQL("SELECT MAX(id) FROM {}").format(sql.Identifier(table)))
                                    maximum = cursor.fetchone()[0]
                                    cursor.execute("SELECT setval(%s, %s, %s)", (sequence, max(1, maximum or 1), maximum is not None))
                        # Force deferred FK validation before marking success.
                        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
                report["applied"] = True
                report["legacy_archived"] = bool(archive_tables)
                report["content_verified"] = True
                return report
        finally:
            # sqlite3 connection context managers don't close connections. The
            # legacy Alembic probe can retain a cycle until GC runs on Windows.
            gc.collect()
