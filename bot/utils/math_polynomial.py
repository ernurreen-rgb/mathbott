"""math polynomial helpers extracted without changing calculation rules."""
import re
from dataclasses import dataclass
from fractions import Fraction
from typing import Dict, Optional, Tuple


Monomial = Tuple[Tuple[str, int], ...]


Polynomial = Dict[Monomial, Fraction]


_MAX_EXPRESSION_LENGTH = 256


_MAX_AST_NODES = 96


_MAX_POLYNOMIAL_TERMS = 256


_MAX_VARIABLES = 8


_MAX_POWER = 20


_MAX_ROOT_DEGREE = 20


_MAX_NUMBER_BITS = 4096


_NUMBER_RE = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")


_NAME_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]*")


_ALLOWED_LONG_NAMES = {
    "alpha",
    "beta",
    "delta",
    "gamma",
    "lambda",
    "mu",
    "omega",
    "phi",
    "pi",
    "rho",
    "sigma",
    "theta",
    "varphi",
}


_LATEX_VARIABLE_RE = re.compile(
    r"\\(alpha|beta|delta|gamma|lambda|mu|omega|phi|pi|rho|sigma|theta|varphi)(?![A-Za-z])"
)


_SUPERSCRIPT_DIGITS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")


@dataclass
class _RationalPolynomial:
    numerator: Polynomial
    denominator: Polynomial


def _clean_polynomial(value: Polynomial) -> Polynomial:
    cleaned = {monomial: coefficient for monomial, coefficient in value.items() if coefficient}
    if len(cleaned) > _MAX_POLYNOMIAL_TERMS:
        raise ValueError("too many polynomial terms")
    return cleaned


def _constant_polynomial(value: Fraction) -> Polynomial:
    return {} if value == 0 else {(): value}


def _variable_polynomial(name: str) -> Polynomial:
    return {((name, 1),): Fraction(1)}


def _add_polynomials(left: Polynomial, right: Polynomial) -> Polynomial:
    result = dict(left)
    for monomial, coefficient in right.items():
        result[monomial] = _ensure_number_size(result.get(monomial, Fraction(0)) + coefficient)
    return _clean_polynomial(result)


def _negate_polynomial(value: Polynomial) -> Polynomial:
    return {monomial: -coefficient for monomial, coefficient in value.items()}


def _multiply_monomials(left: Monomial, right: Monomial) -> Monomial:
    powers: Dict[str, int] = dict(left)
    for variable, exponent in right:
        powers[variable] = powers.get(variable, 0) + exponent
    return tuple(sorted((variable, exponent) for variable, exponent in powers.items() if exponent))


def _multiply_polynomials(left: Polynomial, right: Polynomial) -> Polynomial:
    if not left or not right:
        return {}
    if len(left) * len(right) > _MAX_POLYNOMIAL_TERMS * 2:
        raise ValueError("polynomial expansion is too large")
    result: Polynomial = {}
    for left_monomial, left_coefficient in left.items():
        for right_monomial, right_coefficient in right.items():
            monomial = _multiply_monomials(left_monomial, right_monomial)
            product = _ensure_number_size(left_coefficient * right_coefficient)
            result[monomial] = _ensure_number_size(result.get(monomial, Fraction(0)) + product)
    return _clean_polynomial(result)


def _power_polynomial(value: Polynomial, exponent: int) -> Polynomial:
    result = _constant_polynomial(Fraction(1))
    base = value
    remaining = exponent
    while remaining:
        if remaining % 2:
            result = _multiply_polynomials(result, base)
        remaining //= 2
        if remaining:
            base = _multiply_polynomials(base, base)
    return result


def _constant_value(value: _RationalPolynomial) -> Optional[Fraction]:
    numerator = value.numerator.get((), Fraction(0)) if len(value.numerator) <= 1 else None
    denominator = value.denominator.get((), Fraction(0)) if len(value.denominator) == 1 else None
    if numerator is None or denominator in {None, Fraction(0)}:
        return None
    return numerator / denominator


def _ensure_number_size(value: Fraction) -> Fraction:
    if value.numerator.bit_length() > _MAX_NUMBER_BITS or value.denominator.bit_length() > _MAX_NUMBER_BITS:
        raise ValueError("number is too large")
    return value


def _add_rationals(left: _RationalPolynomial, right: _RationalPolynomial) -> _RationalPolynomial:
    numerator = _add_polynomials(
        _multiply_polynomials(left.numerator, right.denominator),
        _multiply_polynomials(right.numerator, left.denominator),
    )
    denominator = _multiply_polynomials(left.denominator, right.denominator)
    return _RationalPolynomial(numerator, denominator)


def _multiply_rationals(left: _RationalPolynomial, right: _RationalPolynomial) -> _RationalPolynomial:
    return _RationalPolynomial(
        _multiply_polynomials(left.numerator, right.numerator),
        _multiply_polynomials(left.denominator, right.denominator),
    )


def _divide_rationals(left: _RationalPolynomial, right: _RationalPolynomial) -> _RationalPolynomial:
    if not right.numerator:
        raise ValueError("division by zero")
    return _RationalPolynomial(
        _multiply_polynomials(left.numerator, right.denominator),
        _multiply_polynomials(left.denominator, right.numerator),
    )


def _power_rational(value: _RationalPolynomial, exponent: int) -> _RationalPolynomial:
    if abs(exponent) > _MAX_POWER:
        raise ValueError("unsupported exponent")
    if exponent < 0:
        if not value.numerator:
            raise ValueError("division by zero")
        return _RationalPolynomial(
            _power_polynomial(value.denominator, -exponent),
            _power_polynomial(value.numerator, -exponent),
        )
    return _RationalPolynomial(
        _power_polynomial(value.numerator, exponent),
        _power_polynomial(value.denominator, exponent),
    )
