"""Plan/apply SQLite data migration; connection URLs are read only from env."""
import argparse
import asyncio
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import load_environment
from database import Database
from migrations.sqlite_to_postgres import copy_sqlite_to_postgres
from settings import get_settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="mathbot.db", help="SQLite file to snapshot (never changed)")
    parser.add_argument("--apply", action="store_true", help="Copy data into an empty PostgreSQL DB")
    parser.add_argument("--archive-legacy", action="store_true", help="Preserve obsolete tables as JSON in mathbot_legacy_archive")
    parser.add_argument("--schema-only", action="store_true", help="Apply PostgreSQL schema migrations only")
    args = parser.parse_args()
    load_environment()
    settings = get_settings()
    target = settings.database_migration_url or settings.database_url
    if not target:
        parser.error("Set DATABASE_MIGRATION_URL or DATABASE_URL in bot/.env.local")
    if args.schema_only:
        asyncio.run(Database(target, use_pool=False).init())
        print("PostgreSQL schema is up to date")
    else:
        print(json.dumps(copy_sqlite_to_postgres(args.source, target, apply=args.apply,
                                               archive_legacy=args.archive_legacy), indent=2))


if __name__ == "__main__":
    main()
