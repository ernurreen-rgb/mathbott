"""Is a written answer in the same form as the key, not only equal in value?

The checker compares values, so "88+22" equalled the key 110 and a student could pass a task by
typing its condition back; "3x+2x" passed for 5x and "2x≥6" for x≥3 the same way. An answer
now also has to have the key's form: the same terms and factors up to their order and notation,
with nothing left to compute. A plain number (an integer, a decimal, or a fraction in lowest
terms) still matches any key of the same value, so 0,5 = 1/2 and 1024 = 2^{10}.

Forms this module cannot read (number sets, percentages, text, chained inequalities) return
None, and the caller keeps the value comparison alone for them.
"""
from __future__ import annotations

import ast
import re
from fractions import Fraction
from math import gcd
from typing import Any, Optional

from .math_algebra import _fraction_from_numeric_literal, algebraic_python_expression
from .math_polynomial import _MAX_AST_NODES
from .math_statements import (
    _find_top_level_relation,
    _normalize_interval_syntax,
    _normalize_relation_syntax,
    _split_interval_endpoints,
    _split_top_level,
    _split_top_level_relations,
)

# A signed term: (+1 or -1, form). Forms are nested tuples, compared as a whole.
Term = tuple[int, Any]

_RELATIONS = ("=", "≠", "<", ">", "≤", "≥", "∈", "∉")
_INTERVAL_SIGNALS = ("∞", "∪", ";", "[", "]")


def _sorted(items: list) -> tuple:
    # repr keeps the order total when numbers and names sit side by side.
    return tuple(sorted(items, key=repr))


def _integer_literal(node: ast.AST) -> Optional[int]:
    if isinstance(node, ast.Constant) and type(node.value) is int:
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        value = _integer_literal(node.operand)
        return -value if value is not None else None
    return None


def _fraction_literal(node: ast.AST) -> Optional[Term]:
    """a/b of two integers. In lowest terms it is a number; otherwise a fraction left to reduce."""
    if not (isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div)):
        return None
    numerator, denominator = _integer_literal(node.left), _integer_literal(node.right)
    if numerator is None or denominator is None or denominator == 0:
        return None
    if denominator < 0:
        return 1, ("unsimplified_frac_sign", numerator, denominator)
    sign = -1 if (numerator < 0) and numerator != 0 else 1
    numerator = abs(numerator)
    if denominator != 1 and gcd(numerator, denominator) == 1:
        return sign, ("n", Fraction(numerator, denominator))
    return sign, ("frac", numerator, denominator)


def _sum_terms(node: ast.AST, source: str, sign: int) -> list[Term]:
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub)):
        left_terms = _sum_terms(node.left, source, sign)
        if isinstance(node.op, ast.Sub):
            if isinstance(node.right, ast.UnaryOp) and isinstance(node.right.op, ast.USub):
                _, right_form = _term(node.right.operand, source)
                return left_terms + [(sign, ("unsimplified_sub_neg", right_form))]
            return left_terms + _sum_terms(node.right, source, -sign)
        return left_terms + _sum_terms(node.right, source, sign)
    term_sign, form = _term(node, source)
    return [(sign * term_sign, form)]


def _product_factors(node: ast.AST, source: str) -> tuple[int, list, int]:
    literal = _fraction_literal(node)
    if literal is not None:
        return literal[0], [literal[1]], 1 if literal[0] < 0 else 0
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult):
        left_sign, left, left_negs = _product_factors(node.left, source)
        right_sign, right, right_negs = _product_factors(node.right, source)
        return left_sign * right_sign, left + right, left_negs + right_negs
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
        sign, factors, left_negs = _product_factors(node.left, source)
        divisor_sign, divisor = _term(node.right, source)
        neg_count = left_negs + (1 if divisor_sign < 0 else 0)
        if divisor[0] == "n" and divisor[1] != 0:
            # Combine a single coprime integer coefficient with an integer denominator
            # so \frac{2x}{3} and \frac{2}{3}x (or \frac{2\pi}{3} and \frac{2}{3}\pi) match,
            # while unreduced forms like \frac{4x}{6}, \frac{6x}{3}, or \frac{2x}{1} stay distinct.
            divisor_val = divisor[1]
            if isinstance(divisor_val, Fraction) and divisor_val.denominator == 1 and divisor_val.numerator > 1:
                num_indices = [idx for idx, factor in enumerate(factors) if factor[0] == "n"]
                if len(num_indices) == 1:
                    coeff = factors[num_indices[0]][1]
                    if (
                        isinstance(coeff, Fraction)
                        and coeff.denominator == 1
                        and coeff.numerator > 0
                        and gcd(coeff.numerator, divisor_val.numerator) == 1
                    ):
                        combined = list(factors)
                        combined[num_indices[0]] = ("n", Fraction(coeff.numerator, divisor_val.numerator))
                        return sign * divisor_sign, combined, neg_count
            # x/2 is the same answer as ½x or 0,5x.
            return sign * divisor_sign, factors + [("n", 1 / divisor[1])], neg_count
        return sign * divisor_sign, factors + [("inv", divisor)], neg_count
    sign, form = _term(node, source)
    return sign, [form], 1 if sign < 0 else 0


def _term(node: ast.AST, source: str) -> Term:
    if isinstance(node, ast.Expression):
        return _term(node.body, source)
    if isinstance(node, ast.Constant) and type(node.value) in {int, float}:
        literal = ast.get_source_segment(source, node)
        if not literal:
            raise ValueError("invalid number")
        value = _fraction_from_numeric_literal(literal)
        return (-1 if value < 0 else 1), ("n", abs(value))
    if isinstance(node, ast.Name):
        return 1, ("v", node.id.lower())
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        if (
            isinstance(node.op, ast.USub)
            and isinstance(node.operand, ast.UnaryOp)
            and isinstance(node.operand.op, ast.USub)
        ):
            return 1, ("unsimplified_double_neg", _term(node.operand.operand, source))
        sign, form = _term(node.operand, source)
        return (-sign if isinstance(node.op, ast.USub) else sign), form
    if isinstance(node, ast.BinOp):
        if isinstance(node.op, (ast.Add, ast.Sub)):
            return 1, ("sum", _sorted(_sum_terms(node, source, 1)))
        if isinstance(node.op, (ast.Mult, ast.Div)):
            literal = _fraction_literal(node)
            if literal is not None:
                return literal
            sign, factors, neg_count = _product_factors(node, source)
            if neg_count >= 2:
                return sign, ("unsimplified_neg_prod", _sorted(factors))
            return sign, ("prod", _sorted(factors))
        if isinstance(node.op, ast.Pow):
            return 1, ("pow", _term(node.left, source), _term(node.right, source))
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "root"
        and len(node.args) == 2
        and not node.keywords
    ):
        return 1, ("root", _term(node.args[0], source), _term(node.args[1], source))
    raise ValueError("unsupported expression")


def _expression_form(value: str) -> Optional[Term]:
    expression = algebraic_python_expression(value)
    if expression is None:
        return None
    try:
        parsed = ast.parse(expression, mode="eval")
        if sum(1 for _ in ast.walk(parsed)) > _MAX_AST_NODES:
            return None
        return _term(parsed, expression)
    except (SyntaxError, ValueError, ZeroDivisionError, OverflowError, MemoryError, RecursionError):
        return None


def _endpoint_form(value: str) -> Optional[Any]:
    if value in {"∞", "+∞"}:
        return ("inf", 1)
    if value == "-∞":
        return ("inf", -1)
    return _expression_form(value)


def _interval_set_form(value: str) -> Optional[Any]:
    parts = _split_top_level(_normalize_interval_syntax(value), "∪")
    if not parts:
        return None
    intervals = []
    for part in parts:
        if len(part) < 5 or part[0] not in "([" or part[-1] not in ")]":
            return None
        endpoints = _split_interval_endpoints(part[1:-1])
        if endpoints is None:
            return None
        left, right = (_endpoint_form(endpoint) for endpoint in endpoints)
        if left is None or right is None:
            return None
        intervals.append((part[0], left, right, part[-1]))
    return ("intervals", _sorted(list(set(intervals))))


def _statement_form(value: str) -> Optional[Any]:
    parts = _split_top_level_relations(value)
    if not parts:
        return None
    atoms = []
    for part in parts:
        relation = _find_top_level_relation(part)
        if relation is None:
            return None
        index, operator = relation
        left, right = part[:index], part[index + 1:]
        if not left or not right:
            return None
        # x ≥ 3 and 3 ≤ x are the same statement.
        if operator == ">":
            left, right, operator = right, left, "<"
        elif operator == "≥":
            left, right, operator = right, left, "≤"
        if operator == "∈" and len(parts) == 1 and re.fullmatch(r"[A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?", left):
            interval_form = _interval_set_form(right)
            if interval_form is not None:
                return interval_form
        left_form = _expression_form(left)
        right_form = _interval_set_form(right) if operator in {"∈", "∉"} else _expression_form(right)
        if left_form is None or right_form is None:
            return None
        if operator in {"=", "≠"}:
            left_form, right_form = _sorted([left_form, right_form])
        atoms.append((operator, left_form, right_form))
    return ("statement", _sorted(list(set(atoms))))


def answer_form(value: str) -> Optional[Any]:
    """The form of a written answer already normalized for comparison (see validation)."""
    if not value:
        return None
    if value.endswith(r"\%"):
        inner_form = _expression_form(value[:-2])
        if inner_form is None:
            return None
        return ("percent_number", inner_form) if _is_plain_number(inner_form) else ("percent_expr", inner_form)
    if value.endswith("%"):
        inner_form = _expression_form(value[:-1])
        if inner_form is None:
            return None
        return ("percent_number", inner_form) if _is_plain_number(inner_form) else ("percent_expr", inner_form)
    statement = _normalize_relation_syntax(value)
    if any(operator in statement for operator in _RELATIONS):
        return _statement_form(statement)
    if any(signal in _normalize_interval_syntax(value) for signal in _INTERVAL_SIGNALS):
        # "[" also opens \sqrt[3]{...}: what does not read as intervals is read as an expression.
        intervals = _interval_set_form(value)
        if intervals is not None:
            return intervals
    return _expression_form(value)


def _is_plain_number(form: Any) -> bool:
    return isinstance(form, tuple) and len(form) == 2 and isinstance(form[1], tuple) and form[1][0] == "n"


def _is_plain_percent(form: Any) -> bool:
    return isinstance(form, tuple) and len(form) == 2 and form[0] == "percent_number"


def matches_key_form(answer: str, key: str) -> Optional[bool]:
    """False when the answer still differs from the key in form (something left to compute).

    Call it only for answers already equal to the key in value. None means the form could not
    be read on one side, so only the value comparison applies.
    """
    answer_value, key_value = answer_form(answer), answer_form(key)
    if answer_value is None or key_value is None:
        return None
    if answer_value == key_value or _is_plain_number(answer_value):
        return True
    if _is_plain_percent(answer_value) and (_is_plain_percent(key_value) or _is_plain_number(key_value)):
        return True
    return False
