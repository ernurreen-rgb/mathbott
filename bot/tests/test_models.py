"""
Tests for Pydantic models and validation
"""
import pytest
from pydantic import ValidationError
from models.requests import (
    TaskCheckRequest,
    NicknameUpdateRequest,
    ReportRequest
)


def test_task_check_request_valid():
    """Test valid TaskCheckRequest"""
    request = TaskCheckRequest(
        task_id=1,
        answer="42",
        email="test@example.com"
    )
    assert request.task_id == 1
    assert request.answer == "42"
    assert request.email == "test@example.com"


def test_task_check_request_invalid_task_id():
    """Test TaskCheckRequest with invalid task_id"""
    with pytest.raises(ValidationError):
        TaskCheckRequest(
            task_id=0,  # Must be > 0
            answer="42",
            email="test@example.com"
        )


def test_nickname_update_request_valid():
    """Test valid NicknameUpdateRequest"""
    request = NicknameUpdateRequest(
        email="test@example.com",
        nickname="TestUser"
    )
    assert request.email == "test@example.com"
    assert request.nickname == "TestUser"


def test_nickname_update_request_invalid_email():
    """Test NicknameUpdateRequest with invalid email"""
    with pytest.raises(ValidationError):
        NicknameUpdateRequest(
            email="invalid-email",
            nickname="TestUser"
        )


def test_report_request_valid():
    """Test valid ReportRequest"""
    request = ReportRequest(
        task_id=1,
        message="This is a test report message with enough characters"
    )
    assert request.task_id == 1
    assert len(request.message.strip()) >= 5


def test_report_request_too_short():
    """Test ReportRequest with message too short"""
    with pytest.raises(ValidationError):
        ReportRequest(
            task_id=1,
            message="Hi"  # Too short, needs at least 5 characters
        )


def test_report_request_html_sanitization():
    """Test that HTML is sanitized from report message"""
    request = ReportRequest(
        task_id=1,
        message="<script>alert('xss')</script>This is a valid message"
    )
    # HTML tags should be removed
    assert "<script>" not in request.message
    assert "alert('xss')" in request.message



