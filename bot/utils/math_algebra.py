"""math algebra helpers extracted without changing calculation rules."""
import ast
import re
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from math import isqrt
from typing import Dict, Optional
from .math_polynomial import Monomial, Polynomial, _ALLOWED_LONG_NAMES, _LATEX_VARIABLE_RE, _MAX_AST_NODES, _MAX_EXPRESSION_LENGTH, _MAX_ROOT_DEGREE, _MAX_VARIABLES, _NAME_RE, _NUMBER_RE, _RationalPolynomial, _SUPERSCRIPT_DIGITS, _add_rationals, _clean_polynomial, _constant_polynomial, _constant_value, _divide_rationals, _ensure_number_size, _multiply_rationals, _negate_polynomial, _power_rational, _variable_polynomial


def _read_group(value: str, start: int, opening: str = "{", closing: str = "}") -> Optional[tuple[str, int]]:
    if start >= len(value) or value[start] != opening:
        return None
    depth = 0
    for index in range(start, len(value)):
        if value[index] == opening:
            depth += 1
        elif value[index] == closing:
            depth -= 1
            if depth == 0:
                return value[start + 1:index], index + 1
    return None


def _replace_latex_fractions(value: str) -> Optional[str]:
    output = []
    cursor = 0
    while cursor < len(value):
        if not value.startswith(r"\frac", cursor):
            output.append(value[cursor])
            cursor += 1
            continue
        numerator_group = _read_group(value, cursor + len(r"\frac"))
        if numerator_group is None:
            return None
        numerator, after_numerator = numerator_group
        denominator_group = _read_group(value, after_numerator)
        if denominator_group is None:
            return None
        denominator, after_denominator = denominator_group
        numerator = _replace_latex_fractions(numerator)
        denominator = _replace_latex_fractions(denominator)
        if numerator is None or denominator is None:
            return None
        output.append(f"(({numerator})/({denominator}))")
        cursor = after_denominator
    return "".join(output)


def _replace_latex_roots(value: str) -> Optional[str]:
    output = []
    cursor = 0
    while cursor < len(value):
        if not value.startswith(r"\sqrt", cursor):
            output.append(value[cursor])
            cursor += 1
            continue
        argument_start = cursor + len(r"\sqrt")
        degree = "2"
        if argument_start < len(value) and value[argument_start] == "[":
            degree_group = _read_group(value, argument_start, "[", "]")
            if degree_group is None:
                return None
            degree, argument_start = degree_group
        radicand_group = _read_group(value, argument_start)
        if radicand_group is None:
            return None
        radicand, after_radicand = radicand_group
        radicand = _replace_latex_fractions(radicand)
        if radicand is None:
            return None
        radicand = _replace_latex_roots(radicand)
        if radicand is None:
            return None
        output.append(f"root(({radicand}),({degree}))")
        cursor = after_radicand
    return "".join(output)


def _replace_superscripts(value: str) -> str:
    def replacement(match: re.Match[str]) -> str:
        raw = match.group(0)
        negative = raw.startswith("⁻")
        digits = raw[1:] if negative else raw
        exponent = digits.translate(_SUPERSCRIPT_DIGITS)
        return f"^{'-' if negative else ''}{exponent}"

    return re.sub(r"⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+", replacement, value)


def _tokenize_with_implicit_multiplication(value: str) -> Optional[str]:
    tokens: list[tuple[str, str]] = []
    cursor = 0
    while cursor < len(value):
        number = _NUMBER_RE.match(value, cursor)
        if number:
            tokens.append(("number", number.group(0)))
            cursor = number.end()
            continue
        name = _NAME_RE.match(value, cursor)
        if name:
            tokens.append(("name", name.group(0)))
            cursor = name.end()
            continue
        if value.startswith("**", cursor):
            tokens.append(("operator", "**"))
            cursor += 2
            continue
        char = value[cursor]
        if char in "+-*/":
            tokens.append(("operator", char))
        elif char == "(":
            tokens.append(("open", char))
        elif char == ")":
            tokens.append(("close", char))
        elif char == ",":
            tokens.append(("comma", char))
        else:
            return None
        cursor += 1

    output: list[str] = []
    for index, (kind, token) in enumerate(tokens):
        if index:
            previous_kind, previous_token = tokens[index - 1]
            needs_multiplication = (
                previous_kind in {"number", "name", "close"}
                and kind in {"number", "name", "open"}
                and not (previous_kind == "name" and previous_token == "root" and kind == "open")
            )
            if needs_multiplication:
                if previous_kind == "number" and kind == "number":
                    return None
                output.append("*")
        output.append(token)
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


def _fraction_from_numeric_literal(literal: str) -> Fraction:
    try:
        decimal_value = Decimal(literal)
    except InvalidOperation as exc:
        raise ValueError("invalid number") from exc
    if not decimal_value.is_finite() or abs(decimal_value.adjusted()) > 1000:
        raise ValueError("number is too large")
    return _ensure_number_size(Fraction(decimal_value))


def _evaluate_ast(node: ast.AST, variables: set[str], source: str) -> _RationalPolynomial:
    if isinstance(node, ast.Expression):
        return _evaluate_ast(node.body, variables, source)
    if isinstance(node, ast.Constant) and type(node.value) in {int, float}:
        literal = ast.get_source_segment(source, node)
        if not literal:
            raise ValueError("invalid number")
        value = _fraction_from_numeric_literal(literal)
        return _RationalPolynomial(_constant_polynomial(value), _constant_polynomial(Fraction(1)))
    if isinstance(node, ast.Name):
        name = node.id.lower()
        base_name = name.split("_", 1)[0]
        if not (len(base_name) == 1 or base_name in _ALLOWED_LONG_NAMES):
            raise ValueError("unsupported variable")
        variables.add(name)
        if len(variables) > _MAX_VARIABLES:
            raise ValueError("too many variables")
        return _RationalPolynomial(_variable_polynomial(name), _constant_polynomial(Fraction(1)))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _evaluate_ast(node.operand, variables, source)
        if isinstance(node.op, ast.USub):
            value.numerator = _negate_polynomial(value.numerator)
        return value
    if isinstance(node, ast.BinOp):
        left = _evaluate_ast(node.left, variables, source)
        right = _evaluate_ast(node.right, variables, source)
        if isinstance(node.op, ast.Add):
            return _add_rationals(left, right)
        if isinstance(node.op, ast.Sub):
            right.numerator = _negate_polynomial(right.numerator)
            return _add_rationals(left, right)
        if isinstance(node.op, ast.Mult):
            return _multiply_rationals(left, right)
        if isinstance(node.op, ast.Div):
            return _divide_rationals(left, right)
        if isinstance(node.op, ast.Pow):
            exponent = _constant_value(right)
            if exponent is None or exponent.denominator != 1:
                raise ValueError("exponent must be an integer")
            return _power_rational(left, exponent.numerator)
        raise ValueError("unsupported operator")
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "root"
        and len(node.args) == 2
        and not node.keywords
    ):
        radicand = _constant_value(_evaluate_ast(node.args[0], variables, source))
        degree_value = _constant_value(_evaluate_ast(node.args[1], variables, source))
        if radicand is None or degree_value is None or degree_value.denominator != 1:
            raise ValueError("only exact numeric roots are supported")
        degree = degree_value.numerator
        if degree < 2 or degree > _MAX_ROOT_DEGREE:
            raise ValueError("unsupported root degree")
        negative = radicand < 0
        if negative and degree % 2 == 0:
            raise ValueError("even root of negative number")
        numerator = _integer_nth_root_exact(abs(radicand.numerator), degree)
        denominator = _integer_nth_root_exact(radicand.denominator, degree)
        if numerator is None or denominator is None:
            raise ValueError("irrational root")
        value = Fraction(-numerator if negative else numerator, denominator)
        return _RationalPolynomial(_constant_polynomial(value), _constant_polynomial(Fraction(1)))
    raise ValueError("unsupported expression")


def _common_monomial(polynomial: Polynomial) -> Dict[str, int]:
    if not polynomial:
        return {}
    monomials = list(polynomial)
    variables = {variable for monomial in monomials for variable, _ in monomial}
    return {
        variable: min(dict(monomial).get(variable, 0) for monomial in monomials)
        for variable in variables
    }


def _divide_monomial(polynomial: Polynomial, divisor: Dict[str, int]) -> Polynomial:
    result: Polynomial = {}
    for monomial, coefficient in polynomial.items():
        powers = dict(monomial)
        for variable, exponent in divisor.items():
            powers[variable] = powers.get(variable, 0) - exponent
        normalized = tuple(sorted((variable, exponent) for variable, exponent in powers.items() if exponent))
        result[normalized] = coefficient
    return result


def _univariate_coefficients(polynomial: Polynomial, variable: Optional[str]) -> Dict[int, Fraction]:
    coefficients: Dict[int, Fraction] = {}
    for monomial, coefficient in polynomial.items():
        powers = dict(monomial)
        if any(name != variable for name in powers):
            raise ValueError("not a univariate polynomial")
        exponent = powers.get(variable, 0) if variable else 0
        coefficients[exponent] = coefficients.get(exponent, Fraction(0)) + coefficient
    return {exponent: coefficient for exponent, coefficient in coefficients.items() if coefficient}


def _trim_univariate(value: Dict[int, Fraction]) -> Dict[int, Fraction]:
    return {exponent: coefficient for exponent, coefficient in value.items() if coefficient}


def _divide_univariate(
    dividend: Dict[int, Fraction], divisor: Dict[int, Fraction]
) -> tuple[Dict[int, Fraction], Dict[int, Fraction]]:
    if not divisor:
        raise ValueError("division by zero polynomial")
    remainder = dict(dividend)
    quotient: Dict[int, Fraction] = {}
    divisor_degree = max(divisor)
    divisor_lead = divisor[divisor_degree]
    while remainder and max(remainder) >= divisor_degree:
        remainder_degree = max(remainder)
        exponent = remainder_degree - divisor_degree
        coefficient = _ensure_number_size(remainder[remainder_degree] / divisor_lead)
        quotient[exponent] = _ensure_number_size(quotient.get(exponent, Fraction(0)) + coefficient)
        for divisor_exponent, divisor_coefficient in divisor.items():
            target = divisor_exponent + exponent
            product = _ensure_number_size(coefficient * divisor_coefficient)
            remainder[target] = _ensure_number_size(remainder.get(target, Fraction(0)) - product)
        remainder = _trim_univariate(remainder)
    return _trim_univariate(quotient), remainder


def _univariate_gcd(left: Dict[int, Fraction], right: Dict[int, Fraction]) -> Dict[int, Fraction]:
    a, b = dict(left), dict(right)
    while b:
        _, remainder = _divide_univariate(a, b)
        a, b = b, remainder
    if not a:
        return {}
    leading = a[max(a)]
    return {exponent: coefficient / leading for exponent, coefficient in a.items()}


def _from_univariate(value: Dict[int, Fraction], variable: Optional[str]) -> Polynomial:
    result: Polynomial = {}
    for exponent, coefficient in value.items():
        monomial: Monomial = () if exponent == 0 or variable is None else ((variable, exponent),)
        result[monomial] = coefficient
    return _clean_polynomial(result)


def _cancel_univariate_gcd(
    numerator: Polynomial, denominator: Polynomial
) -> tuple[Polynomial, Polynomial]:
    variables = {
        variable
        for polynomial in (numerator, denominator)
        for monomial in polynomial
        for variable, _ in monomial
    }
    if len(variables) > 1:
        return numerator, denominator
    variable = next(iter(variables), None)
    numerator_coefficients = _univariate_coefficients(numerator, variable)
    denominator_coefficients = _univariate_coefficients(denominator, variable)
    divisor = _univariate_gcd(numerator_coefficients, denominator_coefficients)
    if not divisor or max(divisor) == 0:
        return numerator, denominator
    reduced_numerator, numerator_remainder = _divide_univariate(numerator_coefficients, divisor)
    reduced_denominator, denominator_remainder = _divide_univariate(denominator_coefficients, divisor)
    if numerator_remainder or denominator_remainder:
        return numerator, denominator
    return _from_univariate(reduced_numerator, variable), _from_univariate(reduced_denominator, variable)


def _normalize_rational(value: _RationalPolynomial) -> _RationalPolynomial:
    if not value.numerator:
        return _RationalPolynomial({}, _constant_polynomial(Fraction(1)))
    if not value.denominator:
        raise ValueError("division by zero")

    numerator, denominator = _cancel_univariate_gcd(value.numerator, value.denominator)
    if numerator == denominator:
        return _RationalPolynomial(
            _constant_polynomial(Fraction(1)),
            _constant_polynomial(Fraction(1)),
        )

    numerator_common = _common_monomial(numerator)
    denominator_common = _common_monomial(denominator)
    common = {
        variable: min(numerator_common.get(variable, 0), denominator_common.get(variable, 0))
        for variable in set(numerator_common) | set(denominator_common)
    }
    common = {variable: exponent for variable, exponent in common.items() if exponent}
    numerator = _divide_monomial(numerator, common)
    denominator = _divide_monomial(denominator, common)

    leading_monomial = max(denominator)
    leading_coefficient = denominator[leading_monomial]
    scale = Fraction(1) / leading_coefficient
    numerator = {
        monomial: _ensure_number_size(coefficient * scale)
        for monomial, coefficient in numerator.items()
    }
    denominator = {
        monomial: _ensure_number_size(coefficient * scale)
        for monomial, coefficient in denominator.items()
    }
    return _RationalPolynomial(_clean_polynomial(numerator), _clean_polynomial(denominator))


def _serialize_polynomial(value: Polynomial) -> str:
    if not value:
        return "0"
    terms = []
    for monomial in sorted(value):
        coefficient = value[monomial]
        variables = "*".join(
            variable if exponent == 1 else f"{variable}^{exponent}"
            for variable, exponent in monomial
        )
        terms.append(f"{coefficient.numerator}/{coefficient.denominator}:{variables}")
    return ";".join(terms)


def _parse_algebraic_expression(
    value: str, *, normalize: bool = True
) -> Optional[_RationalPolynomial]:
    if not value or len(value) > _MAX_EXPRESSION_LENGTH:
        return None

    expression = _replace_superscripts(value)
    expression = expression.replace(r"\cdot", "*").replace(r"\times", "*").replace(r"\div", "/")
    expression = expression.replace("×", "*").replace("·", "*").replace("÷", "/")
    expression = re.sub(r"(?<=\d),(?=\d)", ".", expression)
    expression = re.sub(r"([A-Za-z]+)_\{([A-Za-z0-9]+)\}", r"\1_\2", expression)
    expression = _LATEX_VARIABLE_RE.sub(lambda match: match.group(1), expression)
    expression = _replace_latex_fractions(expression)
    if expression is None:
        return None
    expression = _replace_latex_roots(expression)
    if expression is None:
        return None
    expression = expression.replace("^", "**").replace("{", "(").replace("}", ")")
    expression = _tokenize_with_implicit_multiplication(expression)
    if expression is None:
        return None

    try:
        parsed = ast.parse(expression, mode="eval")
    except (SyntaxError, ValueError, MemoryError):
        return None
    if sum(1 for _ in ast.walk(parsed)) > _MAX_AST_NODES:
        return None

    try:
        parsed_value = _evaluate_ast(parsed, set(), expression)
        return _normalize_rational(parsed_value) if normalize else parsed_value
    except (InvalidOperation, ValueError, ZeroDivisionError, OverflowError, MemoryError):
        return None


def canonicalize_algebraic_expression(value: str) -> Optional[str]:
    """Return an exact canonical form, or ``None`` outside the safe grammar."""
    canonical = _parse_algebraic_expression(value)
    if canonical is None:
        return None
    return f"__algebra__:{_serialize_polynomial(canonical.numerator)}|{_serialize_polynomial(canonical.denominator)}"


_RELATION_ALIASES = (
    (r"\\notin(?![A-Za-z])", "∉"),
    (r"\\neq(?![A-Za-z])", "≠"),
    (r"\\ne(?![A-Za-z])", "≠"),
    (r"\\geqslant(?![A-Za-z])", "≥"),
    (r"\\geq(?![A-Za-z])", "≥"),
    (r"\\ge(?![A-Za-z])", "≥"),
    (r"\\leqslant(?![A-Za-z])", "≤"),
    (r"\\leq(?![A-Za-z])", "≤"),
    (r"\\le(?![A-Za-z])", "≤"),
    (r"\\in(?![A-Za-z])", "∈"),
    (r"\\gt(?![A-Za-z])", ">"),
    (r"\\lt(?![A-Za-z])", "<"),
)
