"""
Validation utilities
"""
import json
import re
from typing import Any, List, Optional

_MATH_CHAR_TRANSLATION = str.maketrans({
    "\u2212": "-",
    "\u2013": "-",
    "\u2014": "-",
    "\ufe63": "-",
    "\uff0d": "-",
})


def _unwrap_text_wrapper(value: str) -> str:
    current = value
    while True:
        match = re.fullmatch(r"\\text\{([\s\S]*)\}", current)
        if not match:
            return current
        current = match.group(1).strip()


def validate_email(email: str) -> str:
    """Validate email format"""
    email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(email_pattern, email):
        raise ValueError("Invalid email format")
    return email.strip().lower()


def validate_string_length(value: str, min_length: int = 1, max_length: int = 10000, field_name: str = "field") -> str:
    """Validate string length"""
    if not value:
        if min_length > 0:
            raise ValueError(f"{field_name} must be at least {min_length} characters")
        return ""
    value = value.strip()
    if len(value) < min_length:
        raise ValueError(f"{field_name} must be at least {min_length} characters")
    if len(value) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters")
    return value


def sanitize_html(text: str) -> str:
    """Remove HTML tags and script content from text"""
    # Remove script tags and their content
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
    # Remove all other HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    return text


def _normalize_freeform_answer(value: str) -> str:
    trimmed = _unwrap_text_wrapper((value or "").translate(_MATH_CHAR_TRANSLATION).strip())
    # Preserve case for LaTeX-like answers (commands/superscripts/subscripts/groups).
    if re.search(r"[\\\\^_{}]", trimmed):
        return trimmed
    return trimmed.lower()


def _parse_factor_grid_cells(raw_answer: Any) -> Optional[List[Any]]:
    parsed = raw_answer
    if isinstance(raw_answer, str):
        if not raw_answer.strip():
            return None
        try:
            parsed = json.loads(raw_answer)
        except Exception:
            return None

    if not isinstance(parsed, list) or len(parsed) != 4:
        return None

    return list(parsed)


def _sort_factor_grid_rows(cells: List[str]) -> List[List[str]]:
    rows = [
        [cells[0], cells[1]],
        [cells[2], cells[3]],
    ]
    rows.sort(key=lambda row: f"{row[0]}\u0000{row[1]}")
    return rows


def canonicalize_factor_grid_answer(raw_answer: Any) -> str:
    """Validate + normalize factor-grid answer and return canonical flat JSON."""
    if raw_answer is None or (isinstance(raw_answer, str) and not raw_answer.strip()):
        raise ValueError("factor_grid answer is required")

    cells = _parse_factor_grid_cells(raw_answer)
    if cells is None:
        raise ValueError("factor_grid answer must contain exactly 4 items")

    normalized: List[str] = []
    for idx, item in enumerate(cells):
        if not isinstance(item, str):
            raise ValueError(f"factor_grid answer item #{idx + 1} must be a non-empty string")
        value = _normalize_freeform_answer(item)
        if not value:
            raise ValueError(f"factor_grid answer item #{idx + 1} must be a non-empty string")
        normalized.append(value)

    sorted_rows = _sort_factor_grid_rows(normalized)
    flattened = [cell for row in sorted_rows for cell in row]
    return json.dumps(flattened, ensure_ascii=False)


def normalize_task_answer_for_compare(task: dict, user_answer: str) -> str:
    """Normalize user answer depending on task type (mcq/tf/input)."""
    qt = (task.get("question_type") or "input").strip().lower()
    ans = (user_answer or "").strip()
    if qt in {"mcq", "mcq6"}:
        return ans.upper()
    if qt == "select":
        try:
            parsed = json.loads(ans) if ans else []
            if isinstance(parsed, list):
                normalized = [str(item).strip().upper() for item in parsed]
                return json.dumps(normalized, ensure_ascii=False)
        except Exception:
            pass
        # Fallback: treat as pipe- or comma-separated
        parts = [p.strip().upper() for p in re.split(r"[|,]", ans) if p.strip()]
        return json.dumps(parts, ensure_ascii=False)
    if qt == "factor_grid":
        cells = _parse_factor_grid_cells(ans)
        if cells is None:
            return "__invalid_factor_grid__"
        normalized = [_normalize_freeform_answer(str(item) if item is not None else "") for item in cells]
        return json.dumps(_sort_factor_grid_rows(normalized), ensure_ascii=False)
    if qt == "tf":
        v = ans.strip().lower()
        true_set = {"true", "1", "t", "РґР°", "РёСЃС‚РёРЅР°", "РїСЂР°РІРґР°", "РІРµСЂРЅРѕ", "yes"}
        false_set = {"false", "0", "f", "РЅРµС‚", "Р»РѕР¶СЊ", "РЅРµРІРµСЂРЅРѕ", "no"}
        if v in true_set:
            return "true"
        if v in false_set:
            return "false"
        return v
    # input (default)
    return _normalize_freeform_answer(ans)
