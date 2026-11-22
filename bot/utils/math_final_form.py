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

from .math_algebra import _fraction_from_numeric_literal, _integer_nth_root_exact, algebraic_python_expression
from .math_polynomial import _MAX_AST_NODES
from .math_statements import (
    _SINGLE_VARIABLE_RE,
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


def _canonical_mixed_sign_sum(terms: tuple[Term, ...]) -> tuple[int, tuple[Term, ...]]:
    """Canonicalize a difference/mixed-sign sum up to negation: e.g. (1 - x) <-> -(x - 1)."""
    signs = {sign for sign, _ in terms}
    if signs != {-1, 1}:
        return 1, terms
    negated = _sorted([(-sign, form) for sign, form in terms])
    if repr(negated) < repr(terms):
        return -1, negated
    return 1, terms


def _finalize_product_factors(factors: list) -> list:
    """Combine a single coprime integer multiplier with a single integer division (e.g. 2*(x/3) <-> (2x)/3)."""
    div_indices = [idx for idx, factor in enumerate(factors) if factor[0] == "div_n"]
    num_indices = [idx for idx, factor in enumerate(factors) if factor[0] == "n"]
    result = list(factors)
    if len(div_indices) == 1 and len(num_indices) == 1:
        div_idx = div_indices[0]
        num_idx = num_indices[0]
        divisor_int = result[div_idx][1]
        coeff = result[num_idx][1]
        if (
            isinstance(coeff, Fraction)
            and coeff.denominator == 1
            and coeff.numerator > 1
            and gcd(coeff.numerator, divisor_int) == 1
        ):
            result[num_idx] = ("n", Fraction(coeff.numerator, divisor_int))
            result.pop(div_idx)
            return result
    return [
        ("n", Fraction(1, factor[1])) if factor[0] == "div_n" else factor
        for factor in result
    ]


def _extract_simple_term_for_int_division(term: Term) -> Optional[tuple[int, int, tuple]]:
    t_sign, t_form = term
    if not isinstance(t_form, tuple) or not t_form:
        return None
    kind = t_form[0]
    if kind == "n":
        val = t_form[1]
        if isinstance(val, Fraction) and val.denominator == 1 and val.numerator > 0:
            return t_sign, val.numerator, ()
        return None
    if kind in {"v", "pow", "root"}:
        return t_sign, 1, (t_form,)
    if kind == "prod":
        factors = t_form[1]
        if any(
            not isinstance(f, tuple)
            or not f
            or f[0] in {"sum", "inv", "frac", "div_n"}
            or str(f[0]).startswith("unsimplified_")
            for f in factors
        ):
            return None
        num_factors = [f for f in factors if f[0] == "n"]
        rest = tuple(f for f in factors if f[0] != "n")
        if not rest or len(num_factors) > 1:
            return None
        if not num_factors:
            return t_sign, 1, rest
        val = num_factors[0][1]
        if isinstance(val, Fraction) and val.denominator == 1 and val.numerator > 1:
            return t_sign, val.numerator, rest
        return None
    return None


def _try_distribute_sum_over_int_divisor(
    sum_node: ast.AST,
    divisor_node: ast.AST,
    source: str,
    *,
    outer_sign: int = 1,
) -> Optional[Term]:
    """Normalize irreducible (sum) / d (e.g. (x + 1)/2 <-> 0.5x + 0.5) while keeping reducible fractions distinct."""
    if not (isinstance(sum_node, ast.BinOp) and isinstance(sum_node.op, (ast.Add, ast.Sub))):
        return None
    divisor_int = _integer_literal(divisor_node)
    if divisor_int is None or divisor_int <= 1:
        return None
    terms = _sum_terms(sum_node, source, outer_sign)
    if len(terms) < 2:
        return None
    parsed: list[tuple[int, int, tuple]] = []
    for term in terms:
        extracted = _extract_simple_term_for_int_division(term)
        if extracted is None:
            return None
        parsed.append(extracted)
    if not any(rest for _, _, rest in parsed):
        return None
    if gcd(divisor_int, *(coeff for _, coeff, _ in parsed)) > 1:
        return None
    distributed: list[Term] = []
    for t_sign, coeff, rest in parsed:
        new_coeff = Fraction(coeff, divisor_int)
        if not rest:
            distributed.append((t_sign, ("n", new_coeff)))
        elif new_coeff == 1:
            if len(rest) == 1:
                distributed.append((t_sign, rest[0]))
            else:
                distributed.append((t_sign, ("prod", _sorted(list(rest)))))
        else:
            distributed.append((t_sign, ("prod", _sorted([("n", new_coeff), *rest]))))
    return 1, ("sum", _sorted(distributed))


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
            divisor_val = divisor[1]
            if isinstance(divisor_val, Fraction) and divisor_val.denominator == 1 and divisor_val.numerator > 1:
                # Defer combining coprime integer factor and divisor until the full product is collected,
                # so \frac{2x}{3}, 2\cdot\frac{x}{3}, and \frac{2}{3}x all normalize identically.
                return sign * divisor_sign, factors + [("div_n", divisor_val.numerator)], neg_count
            return sign * divisor_sign, factors + [("n", 1 / divisor_val)], neg_count
        if len(factors) == 1 and factors[0][0] == "sum":
            num_flip, canonical_num = _canonical_mixed_sign_sum(factors[0][1])
            if num_flip < 0:
                factors = [("sum", canonical_num)]
                sign = -sign
        if divisor[0] == "sum":
            den_flip, canonical_den = _canonical_mixed_sign_sum(divisor[1])
            if den_flip < 0:
                divisor = ("sum", canonical_den)
                divisor_sign = -divisor_sign
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
        if (
            isinstance(node.op, ast.USub)
            and isinstance(node.operand, ast.BinOp)
            and isinstance(node.operand.op, ast.Div)
        ):
            distributed = _try_distribute_sum_over_int_divisor(
                node.operand.left, node.operand.right, source, outer_sign=-1
            )
            if distributed is not None:
                return distributed
        sign, form = _term(node.operand, source)
        return (-sign if isinstance(node.op, ast.USub) else sign), form
    if isinstance(node, ast.BinOp):
        if isinstance(node.op, (ast.Add, ast.Sub)):
            return 1, ("sum", _sorted(_sum_terms(node, source, 1)))
        if isinstance(node.op, (ast.Mult, ast.Div)):
            if isinstance(node.op, ast.Div):
                distributed = _try_distribute_sum_over_int_divisor(node.left, node.right, source, outer_sign=1)
                if distributed is not None:
                    return distributed
            literal = _fraction_literal(node)
            if literal is not None:
                return literal
            sign, factors, neg_count = _product_factors(node, source)
            factors = _finalize_product_factors(factors)
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
        if operator == "∈" and len(parts) == 1 and _SINGLE_VARIABLE_RE.fullmatch(left):
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


def _eval_constant_form(form: Any) -> Optional[Fraction]:
    if not (isinstance(form, tuple) and len(form) == 2 and form[0] in (-1, 1) and isinstance(form[1], tuple)):
        return None
    sign, body = form
    if not body:
        return None
    kind = body[0]
    if kind == "n":
        val = body[1]
        return sign * val if isinstance(val, Fraction) else None
    if kind == "frac":
        num, den = body[1], body[2]
        if den == 0:
            return None
        return sign * Fraction(num, den)
    if kind == "pow":
        base = _eval_constant_form(body[1])
        exp = _eval_constant_form(body[2])
        if base is None or exp is None or exp.denominator != 1 or abs(exp.numerator) > 100:
            return None
        if base == 0 and exp.numerator < 0:
            return None
        try:
            result = base ** exp.numerator
        except (OverflowError, ZeroDivisionError, ValueError):
            return None
        if result.numerator.bit_length() > 4096 or result.denominator.bit_length() > 4096:
            return None
        return sign * result
    if kind == "root":
        radicand = _eval_constant_form(body[1])
        degree_val = _eval_constant_form(body[2])
        if radicand is None or degree_val is None or degree_val.denominator != 1:
            return None
        degree = degree_val.numerator
        if degree < 2 or degree > 20:
            return None
        neg = radicand < 0
        if neg and degree % 2 == 0:
            return None
        num_root = _integer_nth_root_exact(abs(radicand.numerator), degree)
        den_root = _integer_nth_root_exact(radicand.denominator, degree)
        if num_root is None or den_root is None:
            return None
        return sign * Fraction(-num_root if neg else num_root, den_root)
    if kind == "sum":
        total = Fraction(0)
        for sub in body[1]:
            sub_val = _eval_constant_form(sub)
            if sub_val is None:
                return None
            total += sub_val
        if total.numerator.bit_length() > 4096 or total.denominator.bit_length() > 4096:
            return None
        return sign * total
    if kind == "prod":
        product = Fraction(1)
        for factor in body[1]:
            if isinstance(factor, tuple) and factor and factor[0] == "inv":
                inner_val = _eval_constant_form((1, factor[1]))
                if inner_val is None or inner_val == 0:
                    return None
                product /= inner_val
            else:
                factor_val = _eval_constant_form((1, factor))
                if factor_val is None:
                    return None
                product *= factor_val
            if product.numerator.bit_length() > 4096 or product.denominator.bit_length() > 4096:
                return None
        return sign * product
    return None


def _match_unordered(ans_items: tuple, key_items: tuple, item_matcher) -> bool:
    if len(ans_items) != len(key_items):
        return False
    used = [False] * len(key_items)

    def _backtrack(idx: int) -> bool:
        if idx == len(ans_items):
            return True
        for k_idx, key_item in enumerate(key_items):
            if not used[k_idx] and item_matcher(ans_items[idx], key_item):
                used[k_idx] = True
                if _backtrack(idx + 1):
                    return True
                used[k_idx] = False
        return False

    return _backtrack(0)


def _form_matches(ans_val: Any, key_val: Any) -> bool:
    if ans_val == key_val:
        return True
    if _is_plain_number(ans_val):
        if _is_plain_number(key_val):
            return False
        ans_num = _eval_constant_form(ans_val)
        key_num = _eval_constant_form(key_val)
        return ans_num is not None and key_num is not None and ans_num == key_num
    if (
        isinstance(ans_val, tuple)
        and isinstance(key_val, tuple)
        and len(ans_val) == 2
        and len(key_val) == 2
    ):
        if ans_val[0] == "intervals" and key_val[0] == "intervals":
            return _match_unordered(
                ans_val[1],
                key_val[1],
                lambda a, k: (
                    a[0] == k[0]
                    and a[3] == k[3]
                    and _form_matches(a[1], k[1])
                    and _form_matches(a[2], k[2])
                ),
            )
        if ans_val[0] == "statement" and key_val[0] == "statement":
            def _atom_matches(a, k) -> bool:
                if a[0] != k[0]:
                    return False
                if a[0] in {"=", "≠"}:
                    return (
                        (_form_matches(a[1], k[1]) and _form_matches(a[2], k[2]))
                        or (_form_matches(a[1], k[2]) and _form_matches(a[2], k[1]))
                    )
                return _form_matches(a[1], k[1]) and _form_matches(a[2], k[2])

            return _match_unordered(ans_val[1], key_val[1], _atom_matches)
    return False


def matches_key_form(answer: str, key: str) -> Optional[bool]:
    """False when the answer still differs from the key in form (something left to compute).

    Call it only for answers already equal to the key in value. None means the form could not
    be read on one side, so only the value comparison applies.
    """
    answer_value, key_value = answer_form(answer), answer_form(key)
    if answer_value is None or key_value is None:
        return None
    if answer_value == key_value or _is_plain_number(answer_value) or _form_matches(answer_value, key_value):
        return True
    if _is_plain_percent(answer_value) and (_is_plain_percent(key_value) or _is_plain_number(key_value)):
        return True
    return False
