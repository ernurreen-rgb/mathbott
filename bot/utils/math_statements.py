"""math statements helpers extracted without changing calculation rules."""
import re
from fractions import Fraction
from typing import Optional
from .math_polynomial import Polynomial, _MAX_EXPRESSION_LENGTH, _add_polynomials, _clean_polynomial, _ensure_number_size, _negate_polynomial
from .math_algebra import _RELATION_ALIASES, _parse_algebraic_expression, _serialize_polynomial, canonicalize_algebraic_expression


_RELATION_OPERATORS = frozenset({"=", "≠", "<", ">", "≤", "≥", "∈", "∉"})


_NUMBER_SET_SYMBOLS = {
    "n": "N",
    "ℕ": "N",
    "z": "Z",
    "ℤ": "Z",
    "q": "Q",
    "ℚ": "Q",
    "r": "R",
    "ℝ": "R",
    "c": "C",
    "ℂ": "C",
}


def _normalize_relation_syntax(value: str) -> str:
    normalized = value.replace("!=", "≠").replace("<=", "≤").replace(">=", "≥")
    for pattern, replacement in _RELATION_ALIASES:
        normalized = re.sub(pattern, replacement, normalized)
    normalized = re.sub(r"\\(?:land|wedge)(?![A-Za-z])", "∧", normalized)
    return normalized


def _split_top_level_relations(value: str) -> Optional[list[str]]:
    parts: list[str] = []
    start = 0
    depth = 0
    for index, char in enumerate(value):
        if char in "([{":
            depth += 1
            continue
        if char in ")]}":
            depth -= 1
            if depth < 0:
                return None
            continue
        if depth:
            continue
        is_decimal_comma = (
            char == ","
            and index > 0
            and index + 1 < len(value)
            and value[index - 1].isdigit()
            and value[index + 1].isdigit()
        )
        if char in {",", ";", "∧"} and not is_decimal_comma:
            part = value[start:index]
            if not part:
                return None
            parts.append(part)
            start = index + 1
    if depth != 0:
        return None
    final_part = value[start:]
    if not final_part:
        return None
    parts.append(final_part)
    return parts


def _find_top_level_relation(value: str) -> Optional[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    depth = 0
    for index, char in enumerate(value):
        if char in "([{":
            depth += 1
            continue
        if char in ")]}":
            depth -= 1
            if depth < 0:
                return None
            continue
        if depth == 0 and char in _RELATION_OPERATORS:
            found.append((index, char))
    if depth != 0 or len(found) != 1:
        return None
    return found[0]


def _canonicalize_number_set(value: str) -> Optional[str]:
    direct = _NUMBER_SET_SYMBOLS.get(value.casefold()) or _NUMBER_SET_SYMBOLS.get(value)
    if direct:
        return f"set:{direct}"
    match = re.fullmatch(
        r"\\(?:mathbb|mathbf|mathds)(?:\{([NZQRC])\}|([NZQRC]))",
        value,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return f"set:{(match.group(1) or match.group(2)).upper()}"


def _canonicalize_relation_operand(value: str, *, number_set: bool = False) -> Optional[str]:
    if not value:
        return None
    if number_set:
        canonical_set = _canonicalize_number_set(value)
        if canonical_set:
            return canonical_set
    return canonicalize_algebraic_expression(value) or f"raw:{value}"


def _normalize_interval_syntax(value: str) -> str:
    normalized = value.replace(r"\left", "").replace(r"\right", "")
    normalized = re.sub(r"\\cup(?![A-Za-z])", "∪", normalized)
    normalized = re.sub(r"\\infty(?![A-Za-z])", "∞", normalized)
    return re.sub(r"\s+", "", normalized)


def _split_top_level(value: str, separator: str) -> Optional[list[str]]:
    parts: list[str] = []
    start = 0
    depth = 0
    for index, char in enumerate(value):
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth -= 1
            if depth < 0:
                return None
        elif char == separator and depth == 0:
            part = value[start:index]
            if not part:
                return None
            parts.append(part)
            start = index + 1
    if depth != 0:
        return None
    final_part = value[start:]
    if not final_part:
        return None
    parts.append(final_part)
    return parts


def _split_interval_endpoints(value: str) -> Optional[tuple[str, str]]:
    for separator in (";", ","):
        positions: list[int] = []
        depth = 0
        for index, char in enumerate(value):
            if char in "([{":
                depth += 1
            elif char in ")]}":
                depth -= 1
                if depth < 0:
                    return None
            elif char == separator and depth == 0:
                positions.append(index)
        if depth != 0:
            return None
        if positions:
            if len(positions) != 1:
                return None
            index = positions[0]
            left, right = value[:index], value[index + 1:]
            return (left, right) if left and right else None
    return None


def _canonicalize_interval_endpoint(value: str) -> Optional[str]:
    if value in {"∞", "+∞"}:
        return "+inf"
    if value == "-∞":
        return "-inf"
    return canonicalize_algebraic_expression(value) or (f"raw:{value}" if value else None)


def _canonicalize_interval(value: str) -> Optional[str]:
    if len(value) < 5 or value[0] not in "([" or value[-1] not in ")]":
        return None
    endpoints = _split_interval_endpoints(value[1:-1])
    if endpoints is None:
        return None
    left, right = map(_canonicalize_interval_endpoint, endpoints)
    if left is None or right is None:
        return None
    left_closed = value[0] == "["
    right_closed = value[-1] == "]"
    if (left == "-inf" and left_closed) or (right == "+inf" and right_closed):
        return None
    return f"{'closed' if left_closed else 'open'}:{left}:{right}:{'closed' if right_closed else 'open'}"


def canonicalize_interval_set(value: str, *, allow_ambiguous: bool = False) -> Optional[str]:
    """Canonicalize a union of mathematical intervals.

    Bare parenthesized pairs are intentionally left untouched unless the
    surrounding membership relation proves that they represent an interval.
    """
    if not value or len(value) > _MAX_EXPRESSION_LENGTH:
        return None
    normalized = _normalize_interval_syntax(value)
    has_interval_signal = any(symbol in normalized for symbol in ("∞", "∪", ";", "[", "]"))
    if not allow_ambiguous and not has_interval_signal:
        return None
    parts = _split_top_level(normalized, "∪")
    if not parts:
        return None
    intervals = [_canonicalize_interval(part) for part in parts]
    if any(interval is None for interval in intervals):
        return None
    return "__interval_set__:" + "∪".join(sorted(set(intervals)))


def _constant_polynomial_coefficient(value: Polynomial) -> Optional[Fraction]:
    if len(value) != 1 or () not in value:
        return None
    return value[()]


def _canonicalize_polynomial_comparison(left: str, right: str, operator: str) -> Optional[str]:
    left_value = _parse_algebraic_expression(left, normalize=False)
    right_value = _parse_algebraic_expression(right, normalize=False)
    if left_value is None or right_value is None:
        return None

    left_denominator = _constant_polynomial_coefficient(left_value.denominator)
    right_denominator = _constant_polynomial_coefficient(right_value.denominator)
    if left_denominator in {None, Fraction(0)} or right_denominator in {None, Fraction(0)}:
        return None

    difference = _add_polynomials(
        {
            monomial: _ensure_number_size(coefficient * right_denominator)
            for monomial, coefficient in left_value.numerator.items()
        },
        {
            monomial: _ensure_number_size(-coefficient * left_denominator)
            for monomial, coefficient in right_value.numerator.items()
        },
    )
    denominator_product = left_denominator * right_denominator
    if denominator_product < 0:
        difference = _negate_polynomial(difference)

    if difference:
        first_coefficient = difference[min(difference)]
        if operator in {"=", "≠"}:
            scale = Fraction(1) / first_coefficient
        else:
            scale = Fraction(1) / abs(first_coefficient)
        difference = _clean_polynomial(
            {
                monomial: _ensure_number_size(coefficient * scale)
                for monomial, coefficient in difference.items()
            }
        )
    return f"polynomial:{operator}:{_serialize_polynomial(difference)}"


def _canonicalize_relation_atom(value: str) -> Optional[str]:
    relation = _find_top_level_relation(value)
    if relation is None:
        return None
    index, operator = relation
    left, right = value[:index], value[index + 1:]
    if not left or not right:
        return None

    if operator == ">":
        left, right, operator = right, left, "<"
    elif operator == "≥":
        left, right, operator = right, left, "≤"

    if operator == "∈" and re.fullmatch(r"[A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?", left):
        interval_set = canonicalize_interval_set(right, allow_ambiguous=True)
        if interval_set is not None:
            return interval_set

    if operator in {"=", "≠", "<", "≤"}:
        polynomial = _canonicalize_polynomial_comparison(left, right, operator)
        if polynomial is not None:
            return polynomial

    canonical_left = _canonicalize_relation_operand(left)
    canonical_right = _canonicalize_relation_operand(
        right, number_set=operator in {"∈", "∉"}
    )
    if canonical_left is None or canonical_right is None:
        return None
    if operator in {"=", "≠"}:
        canonical_left, canonical_right = sorted((canonical_left, canonical_right))
    return f"relation:{operator}:{canonical_left}:{canonical_right}"


def canonicalize_math_statement(value: str) -> Optional[str]:
    """Canonicalize conservative equations, inequalities and conjunctions.

    Only top-level, single-operator relations are accepted. Polynomial
    comparisons are normalized exactly; unsupported forms fall back to strict
    operand comparison instead of approximate symbolic solving.
    """
    if not value or len(value) > _MAX_EXPRESSION_LENGTH:
        return None
    normalized = _normalize_relation_syntax(value)
    normalized = re.sub(r"\s+", "", normalized)
    parts = _split_top_level_relations(normalized)
    if not parts:
        return None
    atoms = [_canonicalize_relation_atom(part) for part in parts]
    if any(atom is None for atom in atoms):
        return None
    if len(atoms) == 1 and atoms[0].startswith("__interval_set__:"):
        return atoms[0]
    return "__statement__:" + "&&".join(sorted(set(atoms)))
