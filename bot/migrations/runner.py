"""
Programmatic Alembic runner.

Replaces the legacy `create_schema` bootstrap (CREATE TABLE IF NOT EXISTS +
try/except ALTER TABLE on every startup) with versioned migrations.

Behaviour:
- Fresh database  -> run all migrations from the baseline.
- Legacy database (tables exist, no alembic_version) -> stamp the baseline
  revision, then upgrade to head. Legacy databases are expected to have been
  started with the previous release at least once: the old bootstrap kept
  them structurally identical to the baseline revision.
- Migrated database -> upgrade to head (no-op when already at head).

Alembic is synchronous; `run_migrations_async` executes it in a worker
thread so startup does not block the event loop.
"""
from __future__ import annotations

import asyncio
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


def run_migrations(db_path: str) -> None:
    """Bring the SQLite database at db_path up to the latest schema revision."""
    config = _build_config(db_path)

    with sqlite3.connect(db_path) as probe:
        has_alembic_version = _table_exists(probe, "alembic_version")
        has_legacy_schema = _table_exists(probe, _LEGACY_MARKER_TABLE)

    if not has_alembic_version and has_legacy_schema:
        logger.info(
            "Legacy database detected; stamping baseline revision %s", BASELINE_REVISION
        )
        command.stamp(config, BASELINE_REVISION)

    command.upgrade(config, "head")
    logger.debug("Database migrations applied (head)")


async def run_migrations_async(db_path: str) -> None:
    await asyncio.to_thread(run_migrations, db_path)
