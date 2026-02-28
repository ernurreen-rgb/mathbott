"""
Tests for utility functions
"""
import pytest
from fastapi import HTTPException
from routes.admin.common import _normalize_text_scale
from utils.validation import (
    canonicalize_factor_grid_answer,
    validate_email,
    validate_string_length,
    sanitize_html,
    normalize_task_answer_for_compare
)


def test_validate_email_valid():
    """Test valid email validation"""
    assert validate_email("test@example.com") == "test@example.com"
    assert validate_email("user.name+tag@example.co.uk") == "user.name+tag@example.co.uk"


def test_validate_email_invalid():
    """Test invalid email validation"""
    with pytest.raises(ValueError):
        validate_email("invalid-email")
    
    with pytest.raises(ValueError):
        validate_email("test@")
    
    with pytest.raises(ValueError):
        validate_email("@example.com")


def test_validate_string_length_valid():
    """Test valid string length validation"""
    assert validate_string_length("test", 1, 10) == "test"
    assert validate_string_length("a" * 10, 1, 10) == "a" * 10


def test_validate_string_length_too_short():
    """Test string length validation - too short"""
    with pytest.raises(ValueError, match="at least"):
        validate_string_length("", 1, 10)


def test_validate_string_length_too_long():
    """Test string length validation - too long"""
    with pytest.raises(ValueError, match="at most"):
        validate_string_length("a" * 11, 1, 10)


def test_sanitize_html():
    """Test HTML sanitization"""
    assert sanitize_html("<script>alert('xss')</script>test") == "test"
    assert sanitize_html("<p>Hello</p>") == "Hello"
    assert sanitize_html("No HTML here") == "No HTML here"
    assert sanitize_html("<b>Bold</b> and <i>italic</i>") == "Bold and italic"


def test_normalize_task_answer_for_compare():
    """Test answer normalization for comparison"""
    task = {"question_type": "input", "answer": "42"}
    
    # Should normalize to lowercase and strip
    assert normalize_task_answer_for_compare(task, "  42  ") == "42"
    assert normalize_task_answer_for_compare(task, "42") == "42"
    
    # MCQ should be uppercase
    task_mcq = {"question_type": "mcq", "answer": "A"}
    assert normalize_task_answer_for_compare(task_mcq, "a") == "A"
    
    # True/False should be lowercase
    task_tf = {"question_type": "tf", "answer": "true"}
    assert normalize_task_answer_for_compare(task_tf, "TRUE") == "true"


def test_factor_grid_normalization_and_canonicalization():
    task_factor = {"question_type": "factor_grid", "answer": '["\\\\text{2x}","\\\\text{-1}","\\\\text{x}","\\\\text{3}"]'}

    canonical = normalize_task_answer_for_compare(task_factor, '["2x","-1","x","3"]')
    swapped = normalize_task_answer_for_compare(task_factor, '["x","3","2x","-1"]')
    swapped_with_unicode_minus = normalize_task_answer_for_compare(task_factor, '["x","3","2x","\\u22121"]')
    wrong = normalize_task_answer_for_compare(task_factor, '["-1","2x","x","3"]')

    assert canonical == swapped
    assert canonical == swapped_with_unicode_minus
    assert canonical != wrong
    assert canonicalize_factor_grid_answer('["x","3","2x","-1"]') == '["2x", "-1", "x", "3"]'


def test_factor_grid_invalid_payload_rejected():
    task_factor = {"question_type": "factor_grid", "answer": '["2x","-1","x","3"]'}

    assert normalize_task_answer_for_compare(task_factor, "not-json") == "__invalid_factor_grid__"

    with pytest.raises(ValueError, match="exactly 4 items"):
        canonicalize_factor_grid_answer('["2x","-1","x"]')


def test_normalize_text_scale():
    assert _normalize_text_scale(None) == "md"
    assert _normalize_text_scale("") == "md"
    assert _normalize_text_scale(" SM ") == "sm"
    assert _normalize_text_scale("md") == "md"
    assert _normalize_text_scale("Lg") == "lg"

    with pytest.raises(HTTPException) as exc_info:
        _normalize_text_scale("xl")
    assert exc_info.value.detail == "text_scale must be one of sm, md, lg"

