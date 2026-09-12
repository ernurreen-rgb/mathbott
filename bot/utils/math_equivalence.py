"""Compatibility imports for the existing math_equivalence API."""
import ast
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from math import isqrt
from typing import Dict, Optional, Tuple

from .math_polynomial import (
    Monomial,
    Polynomial,
    _MAX_EXPRESSION_LENGTH,
    _MAX_AST_NODES,
    _MAX_POLYNOMIAL_TERMS,
    _MAX_VARIABLES,
    _MAX_POWER,
    _MAX_ROOT_DEGREE,
    _MAX_NUMBER_BITS,
    _NUMBER_RE,
    _NAME_RE,
    _ALLOWED_LONG_NAMES,
    _LATEX_VARIABLE_RE,
    _SUPERSCRIPT_DIGITS,
    _RationalPolynomial,
    _clean_polynomial,
    _constant_polynomial,
    _variable_polynomial,
    _add_polynomials,
    _negate_polynomial,
    _multiply_monomials,
    _multiply_polynomials,
    _power_polynomial,
    _constant_value,
    _ensure_number_size,
    _add_rationals,
    _multiply_rationals,
    _divide_rationals,
    _power_rational,
)

from .math_algebra import (
    _read_group,
    _replace_latex_fractions,
    _replace_latex_roots,
    _replace_superscripts,
    _tokenize_with_implicit_multiplication,
    _integer_nth_root_exact,
    _fraction_from_numeric_literal,
    _evaluate_ast,
    _common_monomial,
    _divide_monomial,
    _univariate_coefficients,
    _trim_univariate,
    _divide_univariate,
    _univariate_gcd,
    _from_univariate,
    _cancel_univariate_gcd,
    _normalize_rational,
    _serialize_polynomial,
    _parse_algebraic_expression,
    canonicalize_algebraic_expression,
    _RELATION_ALIASES,
)

from .math_statements import (
    _RELATION_OPERATORS,
    _NUMBER_SET_SYMBOLS,
    _normalize_relation_syntax,
    _split_top_level_relations,
    _find_top_level_relation,
    _canonicalize_number_set,
    _canonicalize_relation_operand,
    _normalize_interval_syntax,
    _split_top_level,
    _split_interval_endpoints,
    _canonicalize_interval_endpoint,
    _canonicalize_interval,
    canonicalize_interval_set,
    _constant_polynomial_coefficient,
    _canonicalize_polynomial_comparison,
    _canonicalize_relation_atom,
    canonicalize_math_statement,
)
