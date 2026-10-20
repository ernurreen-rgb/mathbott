"""Shared completion identities and learning streak rules."""
from typing import Any, Dict
from datetime import date, datetime


async def insert_task_completion(db, *, user_id: int, completion_key: str, bank_task_id: int | None,
                                 source: str, source_ref_id: int | None) -> bool:
    """Insert within the caller's transaction; the unique key protects solved counters."""
    cursor = await db.execute(
        """INSERT INTO user_task_completions (user_id, completion_key, bank_task_id, source, source_ref_id)
           VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, completion_key) DO NOTHING""",
        (user_id, completion_key, bank_task_id, source, source_ref_id),
    )
    return cursor.rowcount == 1


def build_completion_identity(task: Dict[str, Any], *, surface: str) -> Dict[str, Any]:
    """Count the same bank exercise once, including across different placements."""
    try:
        bank_task_id = int(task.get("bank_task_id"))
        if bank_task_id <= 0:
            bank_task_id = None
    except (TypeError, ValueError):
        bank_task_id = None

    task_id = int(task.get("id") or 0)
    if bank_task_id is not None:
        completion_key = f"bank:{bank_task_id}"
    elif surface == "module":
        completion_key = f"module-task:{task_id}"
    elif surface in {"trial_test", "trial_test_coop"}:
        completion_key = f"trial-task:{task_id}"
    else:
        raise ValueError(f"Unsupported surface '{surface}'")
    return {"completion_key": completion_key, "bank_task_id": bank_task_id}


def calculate_next_streak(current_streak: int, last_streak_date_value: Any) -> tuple[int, str]:
    """Match the user streak rules while staying inside one submit transaction."""
    today = date.today()
    last_streak_date = None
    if last_streak_date_value:
        try:
            if isinstance(last_streak_date_value, str):
                last_streak_date = datetime.strptime(last_streak_date_value.split()[0], "%Y-%m-%d").date()
            elif isinstance(last_streak_date_value, datetime):
                last_streak_date = last_streak_date_value.date()
            else:
                last_streak_date = last_streak_date_value
        except (TypeError, ValueError):
            last_streak_date = None

    if last_streak_date is None:
        return 1, today.isoformat()
    days_diff = (today - last_streak_date).days
    if days_diff == 0:
        new_streak = current_streak
    elif days_diff == 1:
        new_streak = current_streak + 1
    else:
        new_streak = 1
    return new_streak, today.isoformat()
