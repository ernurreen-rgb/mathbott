"""Production auth/CSRF with an ephemeral SQLite DB; no application auth bypass."""
import asyncio
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "bot"))

from settings import Settings  # noqa: E402

# Freeze every setting before instrument.py can load local .env files.
for name, field in Settings.model_fields.items():
    value = field.default
    os.environ.setdefault(name.upper(), "" if value is None else str(value))
os.environ.update({
    "DATABASE_URL": "",
    "DATABASE_MIGRATION_URL": "",
    "DATABASE_AUTO_MIGRATE": "true",
    "BACKGROUND_TASKS_ENABLED": "false",
    "IMAGE_STORAGE_BACKEND": "local",
    "CSRF_ENABLED": "true",
    "ALERTS_ENABLED": "false",
    "EMAIL_NOTIFICATIONS_ENABLED": "false",
    "PUSH_NOTIFICATIONS_ENABLED": "false",
})

import config  # noqa: E402

# Only this fixture skips dotenv discovery; production startup is unchanged.
config.load_environment = lambda: None


async def seed(db_path):
    from database import Database

    db = Database(db_path=db_path, use_pool=False, auto_migrate=True)
    await db.init()
    await db.users.create_user_by_email(os.environ["E2E_TEACHER_EMAIL"])


if __name__ == "__main__":
    import uvicorn

    with tempfile.TemporaryDirectory(prefix="mathbot-e2e-db-") as directory:
        os.environ["DB_PATH"] = str(Path(directory) / "e2e.sqlite3")
        asyncio.run(seed(os.environ["DB_PATH"]))
        uvicorn.run("main:app", host="127.0.0.1", port=int(os.environ["E2E_API_PORT"]), log_level="warning")
