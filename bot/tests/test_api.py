"""
Tests for API endpoints
"""
import pytest


def test_root_endpoint(client):
    """Test root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert data["message"] == "Mathbot API"


def test_api_modules_map(client):
    """Test modules map endpoint"""
    response = client.get("/api/modules/map")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_api_rating(client):
    """Test rating endpoint"""
    response = client.get("/api/rating?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "items" in data


def test_validation_error(client):
    """Test validation error handling"""
    # Invalid email format
    response = client.post(
        "/api/user/web/nickname",
        json={"email": "invalid-email", "nickname": "test"}
    )
    assert response.status_code == 422  # Validation error


def test_rate_limiting(client):
    """Test rate limiting"""
    # Make multiple requests quickly
    responses = []
    for _ in range(15):  # More than the 10/minute limit
        response = client.post(
            "/api/task/check",
            json={"task_id": 1, "answer": "test", "email": "test@example.com"}
        )
        responses.append(response.status_code)
    
    # At least one should be rate limited (429)
    assert 429 in responses or any(r == 429 for r in responses)

