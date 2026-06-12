"""
Programmatic Alembic runner.

Replaces the legacy `create_schema` bootstrap (CREATE TABLE IF NOT EXISTS +
try/except ALTER TABLE on every startup) with versioned migrations.

Behaviour:
- Fresh database  -> run all migrations from the baseline.
- Legacy database (tables exist, no alembic_version) -> repair the schema up
  to the baseline shape (create missing tables/columns/indexes; the old
  bootstrap was self-healing, so stale databases may predate some of them),
  stamp the baseline revision, then upgrade to head.
- Migrated database -> upgrade to head (no-op when already at head).

Alembic is synchronous; `run_migrations_async` executes it in a worker
thread so startup does not block the event loop.
"""
from __future__ import annotations

import asyncio
import importlib.util
import logging
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger(__name__)

_BOT_DIR = Path(__file__).resolve().parents[1]
_ALEMBIC_INI = _BOT_DIR / "alembic.ini"
BASELINE_REVISION = "0001_baseline"

# Marker table from the legacy bootstrap; if it exists, the schema was
# already created by the pre-Alembic code path.
_LEGACY_MARKER_TABLE = "users"


def _build_config(db_path: str) -> Config:
    config = Config(str(_ALEMBIC_INI))
    config.set_main_option("script_location", str(_BOT_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    return config


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _load_baseline_ddl() -> list:
    baseline_file = _BOT_DIR / "migrations" / "versions" / "0001_baseline.py"
    spec = importlib.util.spec_from_file_location("mathbot_baseline_revision", baseline_file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module._DDL


def _reference_schema() -> dict:
    """Build the baseline schema in-memory and return its tables/columns/indexes.

    The reference is built at the baseline revision (not head): the legacy DB
    is stamped with the baseline afterwards, and later migrations must still
    apply on top of it via the normal upgrade path.
    """
    with sqlite3.connect(":memory:") as ref:
        for statement in _load_baseline_ddl():
            ref.execute(statement)

        tables = {}  # name -> create sql (in creation order)
        for name, sql in ref.execute(
            "SELECT name, sql FROM sqlite_master "
            "WHERE type = 'table' AND sql IS NOT NULL "
            "AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version' "
            "ORDER BY rowid"
        ):
            tables[name] = sql

        columns = {}  # table -> {column -> (type, notnull, dflt_value)}
        for table in tables:
            columns[table] = {
                row[1]: (row[2], bool(row[3]), row[4])
                for row in ref.execute(f"PRAGMA table_info({table})")
            }

        indexes = {}  # name -> create sql
        for name, sql in ref.execute(
            "SELECT name, sql FROM sqlite_master "
            "WHERE type = 'index' AND sql IS NOT NULL"
        ):
            indexes[name] = sql

    return {"tables": tables, "columns": columns, "indexes": indexes}


def _repair_legacy_schema(db_path: str) -> None:
    """
    Bring a pre-Alembic database up to the baseline shape before stamping.

    The legacy bootstrap re-ran CREATE TABLE IF NOT EXISTS and ALTER TABLE
    backfills on every startup, so an old database may miss tables, columns
    or indexes that the baseline revision assumes. Recreate the missing
    pieces from a freshly migrated reference schema; existing data is never
    touched.
    """
    reference = _reference_schema()

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = OFF")

        existing_tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        for table, create_sql in reference["tables"].items():
            if table not in existing_tables:
                logger.warning("Legacy repair: creating missing table %s", table)
                conn.execute(create_sql)

        for table, ref_columns in reference["columns"].items():
            if table not in existing_tables:
                continue  # just created with the full definition
            current = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
            for column, (col_type, notnull, default) in ref_columns.items():
                if column in current:
                    continue
                ddl = f"ALTER TABLE {table} ADD COLUMN {column} {col_type}".rstrip()
                if default is not None:
                    if notnull:
                        ddl += f" NOT NULL DEFAULT {default}"
                    else:
                        ddl += f" DEFAULT {default}"
                elif notnull:
                    # NOT NULL without a default cannot be added to a populated
                    # table; degrade to nullable (legacy ALTERs never had this case).
                    logger.warning(
                        "Legacy repair: adding %s.%s without NOT NULL (no default available)",
                        table,
                        column,
                    )
                logger.warning("Legacy repair: adding missing column %s.%s", table, column)
                conn.execute(ddl)

        existing_indexes = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")
        }
        for index, create_sql in reference["indexes"].items():
            if index not in existing_indexes:
                logger.warning("Legacy repair: creating missing index %s", index)
                conn.execute(create_sql)

        conn.commit()


def run_migrations(db_path: str) -> None:
    """Bring the SQLite database at db_path up to the latest schema revision."""
    config = _build_config(db_path)

    with sqlite3.connect(db_path) as probe:
        has_alembic_version = _table_exists(probe, "alembic_version")
        has_legacy_schema = _table_exists(probe, _LEGACY_MARKER_TABLE)

    if not has_alembic_version and has_legacy_schema:
        logger.info(
            "Legacy database detected; repairing schema and stamping baseline revision %s",
            BASELINE_REVISION,
        )
        _repair_legacy_schema(db_path)
        command.stamp(config, BASELINE_REVISION)

    command.upgrade(config, "head")
    logger.debug("Database migrations applied (head)")


async def run_migrations_async(db_path: str) -> None:
    await asyncio.to_thread(run_migrations, db_path)
