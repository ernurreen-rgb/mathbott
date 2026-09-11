"""
Validation utilities
"""
import ast
import json
import re
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from math import isqrt
from typing import Any, List, Optional

from utils.math_equivalence import (
    canonicalize_algebraic_expression,
    canonicalize_interval_set,
    canonicalize_math_statement,
)

MCQ_ANSWER_LABELS = tuple("ABCDEFGH")
MAX_MCQ_CORRECT_OPTIONS = 3
ANSWER_MODES = {"choices", "written"}
ANSWER_MODE_SWITCH_QUESTION_TYPES = {"mcq", "mcq6", "select"}
MAX_ACCEPTED_ANSWERS = 20

_MATH_CHAR_TRANSLATION = str.maketrans({
    "\u2212": "-",
    "\u2013": "-",
    "\u2014": "-",
    "\ufe63": "-",
    "\uff0d": "-",
})

_MAX_NUMERIC_EXPRESSION_LENGTH = 256
_MAX_NUMERIC_AST_NODES = 64
_MAX_NUMERIC_EXPONENT = 100
_MAX_NUMERIC_ROOT_DEGREE = 20
_MAX_NUMERIC_BITS = 4096


def _unwrap_text_wrapper(value: str) -> str:
    current = value
    while True:
        match = re.fullmatch(r"\\text\{([^{}]*)\}", current)
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


def normalize_answer_mode(raw_value: Any, question_type: Any) -> str:
    """Return the effective UI answer mode for a task.

    Only tasks that already have answer options can be switched. Other task
    types retain their natural interaction regardless of stored legacy data.
    """
    qt = str(question_type or "input").strip().lower()
    if qt == "input":
        return "written"
    if qt not in ANSWER_MODE_SWITCH_QUESTION_TYPES:
        return "choices"
    value = str(raw_value or "choices").strip().lower()
    return value if value in ANSWER_MODES else "choices"


def normalize_accepted_answers(raw_value: Any) -> List[str]:
    """Validate and normalize additional accepted answers stored as JSON."""
    if raw_value is None or raw_value == "":
        return []
    parsed = raw_value
    if isinstance(raw_value, str):
        try:
            parsed = json.loads(raw_value)
        except Exception as exc:
            raise ValueError("accepted_answers must be a JSON array") from exc
    if not isinstance(parsed, list):
        raise ValueError("accepted_answers must be an array")
    if len(parsed) > MAX_ACCEPTED_ANSWERS:
        raise ValueError(f"accepted_answers must contain at most {MAX_ACCEPTED_ANSWERS} items")

    normalized: List[str] = []
    seen: set[str] = set()
    for item in parsed:
        if not isinstance(item, str):
            raise ValueError("accepted_answers items must be strings")
        answer = item.strip()
        if not answer:
            continue
        if len(answer) > 10000:
            raise ValueError("accepted_answers items must be at most 10000 characters")
        if answer in seen:
            continue
        seen.add(answer)
        normalized.append(answer)
    return normalized


def _normalize_freeform_answer(value: str) -> str:
    trimmed = _unwrap_text_wrapper((value or "").translate(_MATH_CHAR_TRANSLATION).strip())
    # Preserve case for LaTeX-like answers (commands/superscripts/subscripts/groups).
    if re.search(r"[\\\\^_{}]", trimmed):
        return trimmed
    return trimmed.lower()


def parse_mcq_answer_labels(raw_answer: Any) -> List[str]:
    if raw_answer is None:
        return []

    if isinstance(raw_answer, list):
        values = raw_answer
    elif isinstance(raw_answer, str):
        text = raw_answer.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
            values = parsed if isinstance(parsed, list) else [parsed]
        except Exception:
            if re.search(r"[,;|]", text):
                values = re.split(r"[,;|]", text)
            elif re.fullmatch(r"[A-Ha-h](?:\s+[A-Ha-h]){1,7}", text):
                values = re.split(r"\s+", text)
            else:
                values = [text]
    else:
        values = [raw_answer]

    labels: List[str] = []
    seen: set[str] = set()
    for item in values:
        label = str(item or "").strip().upper()
        if not label or label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return labels


def serialize_mcq_answer_labels(raw_answer: Any) -> str:
    labels = parse_mcq_answer_labels(raw_answer)
    if not labels:
        return ""
    if len(labels) == 1:
        return labels[0]
    return json.dumps(labels, ensure_ascii=False)


def get_mcq_answer_count(raw_answer: Any) -> int:
    labels = parse_mcq_answer_labels(raw_answer)
    if not labels:
        return 1
    return min(len(labels), MAX_MCQ_CORRECT_OPTIONS)


def _normalize_mcq_answer_for_compare(raw_answer: Any) -> str:
    labels = parse_mcq_answer_labels(raw_answer)
    if len(labels) <= 1:
        return labels[0] if labels else ""
    return json.dumps(sorted(labels), ensure_ascii=False)


def _parse_task_options(task: dict) -> List[dict]:
    raw_options = task.get("options")
    if isinstance(raw_options, str):
        try:
            raw_options = json.loads(raw_options)
        except Exception:
            return []
    if not isinstance(raw_options, list):
        return []
    return [item for item in raw_options if isinstance(item, dict)]


def _parse_written_answer_slots(raw_answer: Any) -> List[str]:
    if isinstance(raw_answer, list):
        return [str(item or "").strip() for item in raw_answer]
    text = "" if raw_answer is None else str(raw_answer).strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(item or "").strip() for item in parsed]
    except Exception:
        pass
    return [text]


def _normalize_written_math_answer(value: str) -> str:
    normalized = _normalize_freeform_answer(value)
    previous = None
    while previous != normalized:
        previous = normalized
        normalized = re.sub(r"\\text\{([^{}]*)\}", r"\1", normalized)
    normalized = normalized.replace(r"\left", "").replace(r"\right", "")
    normalized = normalized.replace(r"\dfrac", r"\frac").replace(r"\tfrac", r"\frac")
    normalized = normalized.replace("{,}", ",")
    normalized = re.sub(r"\\[,;:! ]", "", normalized)
    interval_set = canonicalize_interval_set(normalized)
    mathematical_statement = canonicalize_math_statement(normalized)
    normalized = re.sub(r"\s+", "", normalized)
    numeric_value = _parse_exact_numeric_expression(normalized)
    if numeric_value is not None:
        if numeric_value.denominator == 1:
            return str(numeric_value.numerator)
        return f"{numeric_value.numerator}/{numeric_value.denominator}"
    if mathematical_statement is not None:
        return mathematical_statement
    if interval_set is not None:
        return interval_set
    return canonicalize_algebraic_expression(normalized) or normalized


def _read_latex_group(value: str, start: int, opening: str = "{", closing: str = "}") -> Optional[tuple[str, int]]:
    if start >= len(value) or value[start] != opening:
        return None
    depth = 0
    for index in range(start, len(value)):
        char = value[index]
        if char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return value[start + 1:index], index + 1
    return None


def _replace_latex_fractions(value: str) -> Optional[str]:
    output: List[str] = []
    cursor = 0
    while cursor < len(value):
        if not value.startswith(r"\frac", cursor):
            output.append(value[cursor])
            cursor += 1
            continue

        numerator_group = _read_latex_group(value, cursor + len(r"\frac"))
        if numerator_group is None:
            return None
        numerator, after_numerator = numerator_group
        denominator_group = _read_latex_group(value, after_numerator)
        if denominator_group is None:
            return None
        denominator, after_denominator = denominator_group
        normalized_numerator = _replace_latex_fractions(numerator)
        normalized_denominator = _replace_latex_fractions(denominator)
        if normalized_numerator is None or normalized_denominator is None:
            return None
        output.append(f"(({normalized_numerator})/({normalized_denominator}))")
        cursor = after_denominator
    return "".join(output)


def _replace_latex_roots(value: str) -> Optional[str]:
    output: List[str] = []
    cursor = 0
    while cursor < len(value):
        if not value.startswith(r"\sqrt", cursor):
            output.append(value[cursor])
            cursor += 1
            continue

        argument_start = cursor + len(r"\sqrt")
        degree = "2"
        if argument_start < len(value) and value[argument_start] == "[":
            degree_group = _read_latex_group(value, argument_start, "[", "]")
            if degree_group is None:
                return None
            degree, argument_start = degree_group
        radicand_group = _read_latex_group(value, argument_start)
        if radicand_group is None:
            return None
        radicand, after_radicand = radicand_group
        normalized_radicand = _replace_latex_fractions(radicand)
        if normalized_radicand is None:
            return None
        normalized_radicand = _replace_latex_roots(normalized_radicand)
        if normalized_radicand is None:
            return None
        output.append(f"root(({normalized_radicand}),({degree}))")
        cursor = after_radicand
    return "".join(output)


def _integer_nth_root_exact(value: int, degree: int) -> Optional[int]:
    if value < 0 or degree < 1:
        return None
    if value in {0, 1} or degree == 1:
        return value
    if degree == 2:
        result = isqrt(value)
        return result if result * result == value else None

    low, high = 0, 1 << ((value.bit_length() + degree - 1) // degree)
    while low <= high:
        middle = (low + high) // 2
        powered = middle ** degree
        if powered == value:
            return middle
        if powered < value:
            low = middle + 1
        else:
            high = middle - 1
    return None


def _ensure_safe_fraction(value: Fraction) -> Fraction:
    if value.numerator.bit_length() > _MAX_NUMERIC_BITS or value.denominator.bit_length() > _MAX_NUMERIC_BITS:
        raise ValueError("numeric expression is too large")
    return value


def _fraction_from_numeric_literal(literal: str) -> Fraction:
    try:
        decimal_value = Decimal(literal)
    except InvalidOperation as exc:
        raise ValueError("invalid number") from exc
    if not decimal_value.is_finite() or abs(decimal_value.adjusted()) > 1000:
        raise ValueError("number is too large")
    return _ensure_safe_fraction(Fraction(decimal_value))


def _evaluate_numeric_ast(node: ast.AST, source: str) -> Fraction:
    if isinstance(node, ast.Expression):
        return _evaluate_numeric_ast(node.body, source)
    if isinstance(node, ast.Constant) and type(node.value) in {int, float}:
        literal = ast.get_source_segment(source, node)
        if not literal:
            raise ValueError("invalid number")
        return _fraction_from_numeric_literal(literal)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _evaluate_numeric_ast(node.operand, source)
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.BinOp):
        left = _evaluate_numeric_ast(node.left, source)
        right = _evaluate_numeric_ast(node.right, source)
        if isinstance(node.op, ast.Add):
            return _ensure_safe_fraction(left + right)
        if isinstance(node.op, ast.Sub):
            return _ensure_safe_fraction(left - right)
        if isinstance(node.op, ast.Mult):
            return _ensure_safe_fraction(left * right)
        if isinstance(node.op, ast.Div):
            if right == 0:
                raise ValueError("division by zero")
            return _ensure_safe_fraction(left / right)
        if isinstance(node.op, ast.Pow):
            if right.denominator != 1 or abs(right.numerator) > _MAX_NUMERIC_EXPONENT:
                raise ValueError("unsupported exponent")
            if left == 0 and right.numerator < 0:
                raise ValueError("division by zero")
            return _ensure_safe_fraction(left ** right.numerator)
        raise ValueError("unsupported numeric operator")
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "root"
        and len(node.args) == 2
        and not node.keywords
    ):
        radicand = _evaluate_numeric_ast(node.args[0], source)
        degree_value = _evaluate_numeric_ast(node.args[1], source)
        if degree_value.denominator != 1:
            raise ValueError("root degree must be an integer")
        degree = degree_value.numerator
        if degree < 2 or degree > _MAX_NUMERIC_ROOT_DEGREE:
            raise ValueError("unsupported root degree")
        negative = radicand < 0
        if negative and degree % 2 == 0:
            raise ValueError("even root of a negative number")
        numerator_root = _integer_nth_root_exact(abs(radicand.numerator), degree)
        denominator_root = _integer_nth_root_exact(radicand.denominator, degree)
        if numerator_root is None or denominator_root is None:
            raise ValueError("irrational root")
        if negative:
            numerator_root = -numerator_root
        return _ensure_safe_fraction(Fraction(numerator_root, denominator_root))
    raise ValueError("unsupported numeric expression")


def _parse_exact_numeric_expression(value: str) -> Optional[Fraction]:
    """Parse a small, safe numeric expression and return its exact value.

    This deliberately supports only arithmetic emitted by the math keyboard.
    Unknown commands, variables and irrational roots fall back to strict text
    comparison instead of being guessed approximately.
    """
    if not value or len(value) > _MAX_NUMERIC_EXPRESSION_LENGTH:
        return None

    expression = value.translate(_MATH_CHAR_TRANSLATION)
    expression = expression.replace(r"\cdot", "*").replace(r"\times", "*").replace(r"\div", "/")
    expression = expression.replace("×", "*").replace("·", "*").replace("÷", "/")
    expression = re.sub(r"(?<=\d),(?=\d)", ".", expression)

    expression = _replace_latex_fractions(expression)
    if expression is None:
        return None
    expression = _replace_latex_roots(expression)
    if expression is None:
        return None

    if expression.endswith(r"\%"):
        expression = f"({expression[:-2]})/100"
    elif expression.endswith("%"):
        expression = f"({expression[:-1]})/100"

    expression = expression.replace("^", "**").replace("{", "(").replace("}", ")")
    try:
        parsed = ast.parse(expression, mode="eval")
    except (SyntaxError, ValueError, MemoryError):
        return None
    if sum(1 for _ in ast.walk(parsed)) > _MAX_NUMERIC_AST_NODES:
        return None
    try:
        return _evaluate_numeric_ast(parsed, expression)
    except (ValueError, ZeroDivisionError, OverflowError, MemoryError):
        return None


def _map_written_slots_to_option_labels(task: dict, raw_answer: Any) -> Optional[List[str]]:
    slots = _parse_written_answer_slots(raw_answer)
    if not slots:
        return None

    option_values: dict[str, str] = {}
    for option in _parse_task_options(task):
        label = str(option.get("label") or "").strip().upper()
        text = str(option.get("text") or "").strip()
        if label in MCQ_ANSWER_LABELS and text:
            option_values[label] = _normalize_written_math_answer(text)

    if not option_values:
        return None

    correct_labels = [
        label for label in parse_mcq_answer_labels(task.get("answer")) if label in MCQ_ANSWER_LABELS
    ]
    mapped: List[str] = []
    for slot in slots:
        normalized_slot = _normalize_written_math_answer(slot)
        # Prefer the known correct labels when duplicate option texts exist.
        candidates = [
            label for label in correct_labels if option_values.get(label) == normalized_slot
        ]
        if not candidates:
            candidates = [
                label for label, option_value in option_values.items() if option_value == normalized_slot
            ]
        if not candidates:
            return None
        mapped.append(candidates[0])
    return mapped


def _normalize_choice_or_written_answer_for_compare(task: dict, raw_answer: Any, *, ordered: bool) -> str:
    labels = parse_mcq_answer_labels(raw_answer)
    if labels and all(label in MCQ_ANSWER_LABELS for label in labels):
        normalized_labels = labels if ordered else sorted(labels)
        correct_labels = [
            label for label in parse_mcq_answer_labels(task.get("answer")) if label in MCQ_ANSWER_LABELS
        ]
        normalized_correct = correct_labels if ordered else sorted(correct_labels)
        if normalized_labels == normalized_correct:
            if len(normalized_labels) <= 1:
                return normalized_labels[0] if normalized_labels else ""
            return json.dumps(normalized_labels, ensure_ascii=False)

        # A written answer can itself be a letter (for example, the value "A").
        # Before treating it as a legacy option label, try matching option text.
        mapped_labels = _map_written_slots_to_option_labels(task, raw_answer)
        if mapped_labels is not None:
            normalized_mapped = mapped_labels if ordered else sorted(mapped_labels)
            if normalized_mapped == normalized_correct:
                if len(normalized_mapped) <= 1:
                    return normalized_mapped[0] if normalized_mapped else ""
                return json.dumps(normalized_mapped, ensure_ascii=False)

        if len(normalized_labels) <= 1:
            return normalized_labels[0] if normalized_labels else ""
        return json.dumps(normalized_labels, ensure_ascii=False)

    mapped = _map_written_slots_to_option_labels(task, raw_answer)
    if mapped is not None:
        normalized_mapped = mapped if ordered else sorted(mapped)
        if len(normalized_mapped) <= 1:
            return normalized_mapped[0] if normalized_mapped else ""
        return json.dumps(normalized_mapped, ensure_ascii=False)

    slots = [_normalize_written_math_answer(item) for item in _parse_written_answer_slots(raw_answer)]
    return "__written__" + json.dumps(slots, ensure_ascii=False)


def normalize_task_answer_for_compare(task: dict, user_answer: Any) -> str:
    """Normalize user answer depending on task type (mcq/tf/input)."""
    qt = (task.get("question_type") or "input").strip().lower()
    ans = "" if user_answer is None else str(user_answer).strip()
    if qt in {"mcq", "mcq6"}:
        return _normalize_choice_or_written_answer_for_compare(task, user_answer, ordered=False)
    if qt == "select":
        return _normalize_choice_or_written_answer_for_compare(task, user_answer, ordered=True)
    if qt == "tf":
        v = ans.strip().lower()
        true_set = {"true", "1", "t", "да", "истина", "правда", "верно", "yes"}
        false_set = {"false", "0", "f", "нет", "ложь", "неверно", "no"}
        if v in true_set:
            return "true"
        if v in false_set:
            return "false"
        return v
    # input (default)
    return _normalize_written_math_answer(ans)


def is_task_answer_correct(task: dict, user_answer: Any) -> bool:
    """Compare an answer against the primary answer and all accepted aliases."""
    user_normalized = normalize_task_answer_for_compare(task, user_answer)
    try:
        alternatives = normalize_accepted_answers(task.get("accepted_answers"))
    except ValueError:
        alternatives = []
    expected_answers = [task.get("answer"), *alternatives]
    return any(
        normalize_task_answer_for_compare(task, expected) == user_normalized
        for expected in expected_answers
        if expected is not None
    )
