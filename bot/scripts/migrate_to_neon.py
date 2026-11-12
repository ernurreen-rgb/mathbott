"""Apply the PostgreSQL schema migrations and startup seeds to the configured database.

From bot/: python scripts/migrate_to_neon.py
The target is DATABASE_MIGRATION_URL (direct, unpooled) or, if unset, DATABASE_URL,
read only from the environment or bot/.env.local. --schema-only is accepted for
older instructions and does the same thing.
"""
import argparse
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import load_environment
from database import Database
from settings import get_settings


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--schema-only", action="store_true", help="Same as no flag (kept for older instructions)")
    parser.parse_args()
    load_environment()
    settings = get_settings()
    target = settings.database_migration_url or settings.database_url
    if not target:
        parser.error("Set DATABASE_MIGRATION_URL or DATABASE_URL in bot/.env.local")
    asyncio.run(Database(target, use_pool=False).init())
    print("PostgreSQL schema is up to date")


if __name__ == "__main__":
    main()
