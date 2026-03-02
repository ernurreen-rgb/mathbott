"""
Shared scoring helpers for user rewards.
"""
from typing import Any, Dict, Literal


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
