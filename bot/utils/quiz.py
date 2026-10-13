"""Quiz domain rules shared by transactions and HTTP serializers."""
import hashlib
from typing import Any

from utils.validation import is_task_answer_correct


class QuizError(ValueError):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


def token_hash(token: str) -> str:
    if not isinstance(token, str) or not 32 <= len(token) <= 256:
        raise QuizError("unauthorized", "Participant token required")
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def calculate_speed_points(base_points: int, time_limit: int, time_taken: float, current_streak: int) -> int:
    total_time = max(1.0, float(time_limit))
    if time_taken >= total_time:
        return 0
    fraction = max(0.0, min(1.0, (total_time - time_taken) / total_time))
    bonus = min(500, max(0, (current_streak - 1) * 100))
    return max(100, int(base_points * (0.5 + 0.5 * fraction)) + bonus)


def check_question_answer(question: dict, answer: str) -> bool:
    question_type = question.get("question_type", "input")
    return is_task_answer_correct({
        "question_type": "mcq" if question_type == "multi_select" else question_type,
        "answer": question.get("correct_answer"),
        "options": question.get("options"),
        "accepted_answers": question.get("accepted_answers"),
    }, answer)


def public_question(question: dict) -> dict:
    # Whitelist nested fields too: imported option dictionaries may contain keys.
    return {**{key: question.get(key) for key in (
        "id", "quiz_id", "question_text", "question_type", "time_limit_seconds",
        "points", "sort_order", "image_filename",
    )}, "options": [{"id": opt.get("id"), "text": opt.get("text", "")}
                    for opt in question.get("options", [])]}


def public_participant(participant: dict) -> dict:
    return {key: participant.get(key) for key in (
        "id", "session_id", "nickname", "avatar_color", "score", "streak",
        "correct_count", "total_answered", "is_finished", "joined_at", "last_active_at",
    )}


def answer_result(answer: dict, participant: dict, question: dict) -> dict[str, Any]:
    return {
        "is_correct": bool(answer["is_correct"]),
        "points_awarded": answer["points_awarded"],
        "streak": participant["streak"],
        "total_score": participant["score"],
        "correct_answer": question.get("correct_answer") if not answer["is_correct"] else None,
        "explanation": question.get("explanation"),
    }
