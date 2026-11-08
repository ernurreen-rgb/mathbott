"""Run an isolated bank fixture at 127.0.0.1:8100; never opens the real database.

From bot/: venv/Scripts/python.exe scripts/preview_bank_workspace.py
The frontend preview must use the same test-only proxy secret configured below.
"""
import asyncio
import gc
import json
import os
import sys
import tempfile
from pathlib import Path

BOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BOT_DIR))
PREVIEW_EMAIL = "bank-preview@example.test"
PROXY_SECRET = "local-bank-preview-proxy-secret-2026-11-08"


async def seed(path: str):
    import storage
    from database import Database
    db = Database(path, use_pool=False)
    await db.init()
    user = await db.users.create_user_by_email(PREVIEW_EMAIL, check_admin_email=PREVIEW_EMAIL)
    tasks = []
    for i in range(1, 126):
        kind = ["input", "mcq", "mcq6", "select", "tf"][i % 5]
        options = [{"label": label, "text": str(index + 2)} for index, label in enumerate("ABCDEF"[:6 if kind == "mcq6" else 4])]
        subquestions = [{"text": "x + 1 = 3", "correct": "A"}, {"text": "x + 2 = 6", "correct": "C"}] if kind == "select" else None
        answer = {"mcq": "C", "mcq6": '["A", "C"]', "select": '["A", "C"]', "tf": "true", "input": str(i + 2)}[kind]
        tasks.append({
            "text": f"Есеп #{i}. Есептеңіз: ${i}+2$", "answer": answer, "question_type": kind,
            "answer_mode": "written" if kind == "input" else "choices", "accepted_answers": [], "text_scale": "18:22",
            "difficulty": "ABC"[i % 3], "topics": [] if i % 9 == 0 else ["Алгебра", "Теңдеулер" if i % 2 else "Қысқаша көбейту формулалары"],
            "options": options if kind in {"mcq", "mcq6", "select"} else None, "subquestions": subquestions,
            "image_filename": None, "solution_filename": None,
        })
    tasks[-1].update({"text": "x және y нақты сандар болғанда, өрнектің ең кіші мәнін табыңыз:\n\n$x^2+y^2-8x+4y+24$", "question_type": "mcq", "answer_mode": "choices", "answer": "D", "difficulty": "B", "topics": ["Алгебра", "Толық квадратқа келтіру", "Қысқаша көбейту формулалары"], "options": [{"label": label, "text": text} for label, text in zip("ABCD", ["6", "2", "24", "4"])]})
    await db.bank_tasks.create_tasks_bulk_atomic(tasks=tasks, created_by=user["id"], actor_email=PREVIEW_EMAIL)
    for task_id in (1, 2, 3):
        await db.bank_tasks.soft_delete_task(task_id, actor_user_id=user["id"])
    async with storage.connect(path) as connection:
        await connection.execute("INSERT INTO trial_tests (id, title, expected_tasks_count) VALUES (1, 'Банк интерфейсін тексеру', 2)")
        await connection.executemany("INSERT INTO trial_test_tasks (trial_test_id, bank_task_id, sort_order) VALUES (1, ?, ?)", [(125, 0), (124, 1)])
        await connection.commit()
    print(json.dumps({"fixture": "bank-workspace", "active": 122, "trash": 3, "email": PREVIEW_EMAIL}, ensure_ascii=False), flush=True)


def main():
    workspace_tmp = BOT_DIR.parent / "tmp"
    workspace_tmp.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="bank-workspace-", dir=workspace_tmp) as directory:
        path = str(Path(directory) / "fixture.sqlite")
        os.environ.update({"DB_PATH": path, "DATABASE_URL": "", "DATABASE_MIGRATION_URL": "", "ENVIRONMENT": "development",
                           "DATABASE_AUTO_MIGRATE": "false", "BACKGROUND_TASKS_ENABLED": "false", "INTERNAL_PROXY_SHARED_SECRET": PROXY_SECRET,
                           "SENTRY_DSN": "", "ALERTS_ENABLED": "false", "IMAGE_STORAGE_BACKEND": "local", "IMPORT_PREVIEW_TOKEN_SECRET": PROXY_SECRET,
                           "CSRF_ENABLED": "false"})
        try:
            asyncio.run(seed(path))
            import uvicorn
            from main import app
            uvicorn.run(app, host="127.0.0.1", port=8100, log_level="warning")
        finally:
            gc.collect()


if __name__ == "__main__":
    main()
