"""
Tests for utility functions
"""
import json

import pytest
from fastapi import HTTPException
from routes.admin.common import _normalize_text_scale
from utils.file_storage import normalize_stored_image_filename
from utils.scoring import build_reward_identity, normalize_difficulty_code, points_for_difficulty
from utils.internal_proxy_auth import build_ws_token, verify_ws_token
from utils.validation import (
    get_mcq_answer_count,
    parse_mcq_answer_labels,
    serialize_mcq_answer_labels,
    validate_email,
    validate_string_length,
    sanitize_html,
    normalize_answer_mode,
    normalize_accepted_answers,
    normalize_task_answer_for_compare,
    is_task_answer_correct,
)


def test_validate_email_valid():
    """Test valid email validation"""
    assert validate_email("test@example.com") == "test@example.com"
    assert validate_email("user.name+tag@example.co.uk") == "user.name+tag@example.co.uk"


def test_normalize_answer_mode_respects_switchable_question_types():
    assert normalize_answer_mode("written", "mcq") == "written"
    assert normalize_answer_mode(None, "mcq") == "choices"
    assert normalize_answer_mode("choices", "input") == "written"
    assert normalize_answer_mode("written", "tf") == "choices"


def test_normalize_accepted_answers_validates_and_deduplicates_values():
    assert normalize_accepted_answers('[" x=1 ", "x=1", "2x=2", ""]') == ["x=1", "2x=2"]
    with pytest.raises(ValueError, match="JSON array"):
        normalize_accepted_answers("x=1")
    with pytest.raises(ValueError, match="must be strings"):
        normalize_accepted_answers([1])


def test_task_answer_can_match_an_explicit_accepted_alternative():
    task = {
        "question_type": "input",
        "answer": r"(-\infty;1)\cup(1;+\infty)",
        "accepted_answers": [r"\mathbb{R}\setminus\{1\}"],
    }

    assert is_task_answer_correct(task, r"\mathbb{R}\setminus\{1\}") is True
    assert is_task_answer_correct(task, r"\mathbb{R}\setminus\{2\}") is False


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

    # MCQ with multiple correct labels should be order-insensitive
    task_mcq_multi = {"question_type": "mcq", "answer": '["A","C","E"]'}
    assert normalize_task_answer_for_compare(task_mcq_multi, '["E","A","C"]') == '["A", "C", "E"]'
    assert normalize_task_answer_for_compare(task_mcq_multi, "e,a,c") == '["A", "C", "E"]'
    assert normalize_task_answer_for_compare(task_mcq_multi, "A,C") != normalize_task_answer_for_compare(task_mcq_multi, "A,B")

    # Written MCQ answers should map back to the existing option labels.
    task_mcq_written = {
        "question_type": "mcq",
        "answer": "A",
        "options": json.dumps([
            {"label": "A", "text": r"\text{-}\frac{16}{25}"},
            {"label": "B", "text": r"\frac{16}{25}"},
        ]),
    }
    assert normalize_task_answer_for_compare(task_mcq_written, r"-\frac{16}{25}") == "A"
    assert normalize_task_answer_for_compare(task_mcq_written, r"\frac{16}{25}") == "B"

    task_mcq_letter_value = {
        "question_type": "mcq",
        "answer": "B",
        "options": [
            {"label": "A", "text": "B"},
            {"label": "B", "text": "A"},
        ],
    }
    assert normalize_task_answer_for_compare(task_mcq_letter_value, "A") == "B"

    task_mcq_decimal_comma = {
        "question_type": "mcq",
        "answer": "A",
        "options": [{"label": "A", "text": "1,5"}],
    }
    assert normalize_task_answer_for_compare(task_mcq_decimal_comma, "1{,}5") == "A"

    task_mcq_written_multi = {
        "question_type": "mcq",
        "answer": '["A","C"]',
        "options": [
            {"label": "A", "text": "x=1"},
            {"label": "B", "text": "x=2"},
            {"label": "C", "text": "x=3"},
        ],
    }
    assert normalize_task_answer_for_compare(task_mcq_written_multi, '["x=3","x=1"]') == '["A", "C"]'

    task_select_written = {
        "question_type": "select",
        "answer": '["B","A"]',
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
        ],
    }
    assert normalize_task_answer_for_compare(task_select_written, '["3","2"]') == '["B", "A"]'
    
    # True/False should be lowercase
    task_tf = {"question_type": "tf", "answer": "true"}
    assert normalize_task_answer_for_compare(task_tf, "TRUE") == "true"


@pytest.mark.parametrize(
    ("expected", "equivalent"),
    [
        (r"\frac{1}{2}", "0.5"),
        (r"\frac{1}{2}", "0,5"),
        (r"\frac{1}{2}", "2/4"),
        (r"-\frac{3}{4}", "−0.75"),
        ("8", "2^3"),
        ("2", r"\sqrt{4}"),
        ("2", r"\sqrt[3]{8}"),
        ("1/2", "50%"),
    ],
)
def test_written_numeric_answers_are_compared_by_exact_value(expected, equivalent):
    task = {"question_type": "input", "answer": expected}

    assert normalize_task_answer_for_compare(task, expected) == normalize_task_answer_for_compare(task, equivalent)


def test_written_numeric_answer_does_not_accept_a_different_value():
    task = {"question_type": "input", "answer": r"\frac{1}{2}"}

    assert normalize_task_answer_for_compare(task, "0.5") != normalize_task_answer_for_compare(task, "0.51")

    precise_task = {"question_type": "input", "answer": "0.10000000000000001"}
    assert normalize_task_answer_for_compare(precise_task, precise_task["answer"]) != normalize_task_answer_for_compare(
        precise_task, "0.1"
    )


@pytest.mark.parametrize(
    ("expected", "equivalent"),
    [
        ("x^2-1", "(x-1)(x+1)"),
        ("2x+2", "2(x+1)"),
        (r"\frac{2}{b-1}", r"-\frac{2}{1-b}"),
        (r"\pi", r"\frac{2\pi}{2}"),
        ("x^2-x", "x(x-1)"),
        ("x²+2x+1", "(x+1)^2"),
        (r"\frac{x^2-1}{x-1}", "x+1"),
        (r"\frac{1}{x+1}+\frac{1}{x+1}", r"\frac{2}{x+1}"),
    ],
)
def test_written_algebraic_answers_are_compared_by_exact_form(expected, equivalent):
    task = {"question_type": "input", "answer": expected}

    assert normalize_task_answer_for_compare(task, expected) == normalize_task_answer_for_compare(task, equivalent)


def test_written_algebraic_answer_does_not_accept_a_different_expression():
    task = {"question_type": "input", "answer": "x^2-1"}

    assert normalize_task_answer_for_compare(task, "(x-1)(x+1)") != normalize_task_answer_for_compare(task, "x^2+1")


@pytest.mark.parametrize(
    ("expected", "equivalent"),
    [
        ("x=1", "1=x"),
        ("x=1", "2x=2"),
        (r"x\ne1", "1≠x"),
        ("x>1", "1<x"),
        (r"x\ge1", "1≤x"),
        ("x>1", "2x>2"),
        (r"x\in\mathbb{R},x\ne1", "x≠1;x∈ℝ"),
        (r"x\in\mathbb{R}\land x\ne1", "x∈r,x!=1"),
    ],
)
def test_written_relations_are_compared_by_exact_form(expected, equivalent):
    task = {"question_type": "input", "answer": expected}

    assert normalize_task_answer_for_compare(task, expected) == normalize_task_answer_for_compare(task, equivalent)


@pytest.mark.parametrize(
    ("expected", "different"),
    [
        ("x>1", "x<1"),
        ("x≥1", "x>1"),
        (r"x\in\mathbb{R},x\ne1", r"x\in\mathbb{R},x\ne2"),
        (r"x\in\mathbb{R}", r"x\in\mathbb{Z}"),
    ],
)
def test_written_relations_do_not_accept_a_different_statement(expected, different):
    task = {"question_type": "input", "answer": expected}

    assert normalize_task_answer_for_compare(task, expected) != normalize_task_answer_for_compare(task, different)


@pytest.mark.parametrize(
    ("expected", "equivalent"),
    [
        (r"(-\infty;1)\cup(1;+\infty)", "(-∞,1)∪(1,+∞)"),
        (r"[-2;3)", "[-2,3)"),
        (r"(-\infty;1)\cup(1;+\infty)", r"x\in(1,+\infty)\cup(-\infty,1)"),
        (r"[0;\frac{1}{2}]", "[0,0.5]"),
    ],
)
def test_written_interval_sets_are_compared_by_exact_form(expected, equivalent):
    task = {"question_type": "input", "answer": expected}

    assert normalize_task_answer_for_compare(task, expected) == normalize_task_answer_for_compare(task, equivalent)


@pytest.mark.parametrize(
    ("expected", "different"),
    [
        ("[-2;3)", "(-2;3)"),
        (r"(-\infty;1)\cup(1;+\infty)", r"(-\infty;1]\cup(1;+\infty)"),
        ("[0;1]", "[0;2]"),
    ],
)
def test_written_interval_sets_do_not_accept_different_boundaries(expected, different):
    task = {"question_type": "input", "answer": expected}

    assert normalize_task_answer_for_compare(task, expected) != normalize_task_answer_for_compare(task, different)


def test_parenthesized_pair_is_not_assumed_to_be_an_interval():
    task = {"question_type": "input", "answer": "(1,2)"}

    assert normalize_task_answer_for_compare(task, "(1,2)").startswith("__algebra__:") is False
    assert normalize_task_answer_for_compare(task, "(1,2)") != normalize_task_answer_for_compare(task, "(1;2)")


def test_unknown_text_is_not_treated_as_an_algebraic_expression():
    task = {"question_type": "input", "answer": "cat-cat+dog"}

    assert normalize_task_answer_for_compare(task, "cat-cat+dog") == "cat-cat+dog"


def test_written_mcq_maps_equivalent_numeric_value_to_option_label():
    task = {
        "question_type": "mcq",
        "answer_mode": "written",
        "answer": "A",
        "options": [
            {"label": "A", "text": r"\frac{1}{2}"},
            {"label": "B", "text": r"\frac{2}{3}"},
        ],
    }

    assert normalize_task_answer_for_compare(task, "0,5") == "A"
    assert normalize_task_answer_for_compare(task, "0.666") != "B"


def test_written_mcq_maps_equivalent_algebraic_expression_to_option_label():
    task = {
        "question_type": "mcq",
        "answer_mode": "written",
        "answer": "B",
        "options": [
            {"label": "A", "text": "x^2+x"},
            {"label": "B", "text": "x^2-x"},
        ],
    }

    assert normalize_task_answer_for_compare(task, "x(x-1)") == "B"


def test_mcq_answer_label_helpers():
    assert parse_mcq_answer_labels("a,c,a") == ["A", "C"]
    assert parse_mcq_answer_labels('["B","D"]') == ["B", "D"]
    assert serialize_mcq_answer_labels(["A"]) == "A"
    assert serialize_mcq_answer_labels(["A", "C"]) == '["A", "C"]'
    assert get_mcq_answer_count('["A","C","E"]') == 3
    assert get_mcq_answer_count("") == 1


def test_normalize_text_scale():
    assert _normalize_text_scale(None) == "md"
    assert _normalize_text_scale("") == "md"
    assert _normalize_text_scale(" SM ") == "sm"
    assert _normalize_text_scale("md") == "md"
    assert _normalize_text_scale("Lg") == "lg"

    with pytest.raises(HTTPException) as exc_info:
        _normalize_text_scale("xl")
    assert exc_info.value.detail == "text_scale must be one of sm, md, lg"


def test_scoring_helpers():
    assert normalize_difficulty_code("a") == "A"
    assert normalize_difficulty_code("B") == "B"
    assert normalize_difficulty_code("c") == "C"
    assert normalize_difficulty_code("bad") == "B"

    assert points_for_difficulty("A") == 10
    assert points_for_difficulty("B") == 15
    assert points_for_difficulty("C") == 20
    assert points_for_difficulty(None) == 15

    module_identity = build_reward_identity(
        {"id": 11, "bank_task_id": 5, "difficulty": "C"},
        surface="module",
    )
    assert module_identity["reward_key"] == "bank:5"
    assert module_identity["difficulty"] == "C"
    assert module_identity["points"] == 20

    module_fallback = build_reward_identity(
        {"id": 12, "bank_task_id": None, "difficulty": "A"},
        surface="module",
    )
    assert module_fallback["reward_key"] == "module-task:12"

    trial_fallback = build_reward_identity(
        {"id": 21, "bank_task_id": 0, "bank_difficulty": "B"},
        surface="trial_test",
    )
    assert trial_fallback["reward_key"] == "trial-task:21"


def test_stored_image_filename_normalization():
    assert normalize_stored_image_filename("valid-image_1.png") == "valid-image_1.png"
    assert normalize_stored_image_filename("valid.IMAGE.webp") == "valid.IMAGE.webp"
    assert normalize_stored_image_filename("../outside.png") is None
    assert normalize_stored_image_filename("nested/outside.png") is None
    assert normalize_stored_image_filename("bad<script>.png") is None
    assert normalize_stored_image_filename("not-image.txt") is None


def test_ws_token_round_trip(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", "test-shared-secret")

    token = build_ws_token(session_id=42, user_email="USER@example.com", timestamp=1_700_000_000)

    monkeypatch.setattr("utils.internal_proxy_auth.time.time", lambda: 1_700_000_010)
    assert verify_ws_token(session_id=42, user_email="user@example.com", token=token) == (True, None)
    assert verify_ws_token(session_id=43, user_email="user@example.com", token=token) == (
        False,
        "invalid_signature",
    )


def test_ws_token_requires_secret_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("INTERNAL_PROXY_SHARED_SECRET", raising=False)

    with pytest.raises(ValueError, match="proxy_secret_missing"):
        build_ws_token(session_id=1, user_email="user@example.com")

