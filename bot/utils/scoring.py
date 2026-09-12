"""
Shared scoring helpers for user rewards.
"""
from typing import Any, Dict, Literal
from datetime import date, datetime


POINTS_BY_DIFFICULTY: Dict[str, int] = {
    "A": 10,
    "B": 15,
    "C": 20,
}


def normalize_difficulty_code(value: Any) -> Literal["A", "B", "C"]:
    normalized = str(value or "").strip().upper()
    if normalized in POINTS_BY_DIFFICULTY:
        return normalized  # type: ignore[return-value]
    return "B"


def points_for_difficulty(value: Any) -> int:
    return POINTS_BY_DIFFICULTY[normalize_difficulty_code(value)]


def build_reward_identity(task: Dict[str, Any], *, surface: str) -> Dict[str, Any]:
    bank_task_id = task.get("bank_task_id")
    try:
        bank_task_id = int(bank_task_id)
        if bank_task_id <= 0:
            bank_task_id = None
    except Exception:
        bank_task_id = None

    difficulty = normalize_difficulty_code(task.get("difficulty") or task.get("bank_difficulty"))
    points = points_for_difficulty(difficulty)

    task_id = int(task.get("id") or 0)
    if bank_task_id is not None:
        reward_key = f"bank:{bank_task_id}"
    elif surface == "module":
        reward_key = f"module-task:{task_id}"
    elif surface in {"trial_test", "trial_test_coop"}:
        reward_key = f"trial-task:{task_id}"
    else:
        raise ValueError(f"Unsupported surface '{surface}'")

    return {
        "reward_key": reward_key,
        "bank_task_id": bank_task_id,
        "difficulty": difficulty,
        "points": points,
    }


def calculate_next_streak(current_streak: int, last_streak_date_value: Any) -> tuple[int, str]:
    """Match the user streak rules while staying inside one submit transaction."""
    today = date.today()
    last_streak_date = None

    if last_streak_date_value:
        try:
            if isinstance(last_streak_date_value, str):
                raw_value = last_streak_date_value.split()[0]
                last_streak_date = datetime.strptime(raw_value, "%Y-%m-%d").date()
            elif isinstance(last_streak_date_value, datetime):
                last_streak_date = last_streak_date_value.date()
            else:
                last_streak_date = last_streak_date_value
        except Exception:
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
