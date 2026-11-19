"""Create a fresh database for the browser tests (web/e2e) and fill it with a small course.

Usage (from bot/): E2E_DATABASE_URL=postgresql://user:pass@host:5432/qazmath_e2e python scripts/seed_e2e.py

The database named in E2E_DATABASE_URL is dropped and created again, so point it at a
disposable server only. The script refuses names that do not end in "_e2e".
"""
import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg  # noqa: E402

from database import Database  # noqa: E402

STUDENT = "e2e-student@example.com"

# lesson id -> (title, {mini index: [(task text, answer, question type, options)]})
# A lesson always has four mini-lessons (the API creates missing ones empty), as in production.
COURSE = {
    1: ("Қосу", {
        1: [("2 + 3", "5", "input", None), ("7 — жай сан.", "true", "tf", None)],
        2: [("4 + 4", "8", "input", None)],
        3: [("1 + 1", "2", "input", None)],
        4: [("3 + 3", "6", "input", None)],
    }),
    2: ("Азайту", {
        1: [("10 - 3", "7", "input", None)],
    }),
}
TRIAL_TEST = ("E2E сынақ тесті", [
    ("6 : 2", "3", "input", None),
    ("Қайсысы жұп сан?", "B", "mcq", [{"label": "A", "text": "3"}, {"label": "B", "text": "4"},
                                       {"label": "C", "text": "5"}, {"label": "D", "text": "7"}]),
])


def _server_url(database_url: str) -> tuple[str, str]:
    parts = urlsplit(database_url)
    name = parts.path.lstrip("/")
    if not name.endswith("_e2e"):
        raise SystemExit(f"Refusing to recreate database {name!r}: its name must end in _e2e")
    return urlunsplit(parts._replace(path="/postgres")), name


async def main() -> None:
    url = os.environ["E2E_DATABASE_URL"].strip()
    server, name = _server_url(url)
    with psycopg.connect(server, autocommit=True) as connection:
        connection.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        connection.execute(f'CREATE DATABASE "{name}"')

    db = Database(url)
    await db.init()
    await db.users.create_user_by_email(STUDENT)

    with psycopg.connect(url, autocommit=True) as c:
        c.execute("INSERT INTO modules (id, name, sort_order) VALUES (1, 'Арифметика', 0)")
        c.execute("INSERT INTO sections (id, module_id, name, sort_order) VALUES (1, 1, 'Амалдар', 0)")
        for lesson_id, (title, minis) in COURSE.items():
            c.execute("INSERT INTO lessons (id, section_id, title, lesson_number, sort_order) VALUES (%s, 1, %s, %s, %s)",
                      (lesson_id, title, lesson_id, lesson_id - 1))
            for mini_index in minis:
                c.execute("INSERT INTO mini_lessons (id, lesson_id, mini_index, title, sort_order) VALUES (%s, %s, %s, %s, %s)",
                          (lesson_id * 10 + mini_index, lesson_id, mini_index, f"Мини-сабақ {mini_index}", mini_index - 1))

    placements = []
    task_id = 100
    for lesson_id, (_title, minis) in COURSE.items():
        for mini_index, tasks in minis.items():
            for order, (text, answer, kind, options) in enumerate(tasks):
                bank = await db.bank_tasks.create_task(text=text, answer=answer, question_type=kind,
                                                       options=options, difficulty="A")
                task_id += 1
                placements.append((task_id, lesson_id * 10 + mini_index, bank["id"], order))

    trial_title, trial_tasks = TRIAL_TEST
    trial_bank_ids = []
    for text, answer, kind, options in trial_tasks:
        bank = await db.bank_tasks.create_task(text=text, answer=answer, question_type=kind,
                                               options=options, difficulty="A")
        trial_bank_ids.append(bank["id"])

    with psycopg.connect(url, autocommit=True) as c:
        for placement in placements:
            c.execute("INSERT INTO tasks (id, mini_lesson_id, bank_task_id, sort_order) VALUES (%s, %s, %s, %s)", placement)
        c.execute("INSERT INTO trial_tests (id, title, expected_tasks_count) VALUES (1, %s, %s)",
                  (trial_title, len(trial_bank_ids)))
        for order, bank_id in enumerate(trial_bank_ids):
            c.execute("INSERT INTO trial_test_tasks (trial_test_id, bank_task_id, sort_order) VALUES (1, %s, %s)",
                      (bank_id, order))
        for table in ("modules", "sections", "lessons", "mini_lessons", "tasks", "trial_tests"):
            c.execute(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), (SELECT MAX(id) FROM {table}) + 1, false)")

    await db.connection_pool.close()
    print(f"seeded {name}: {len(placements)} lesson tasks, {len(trial_bank_ids)} trial test tasks", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
