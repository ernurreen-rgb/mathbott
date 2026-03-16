"""
Tests for middleware
"""
import pytest
from fastapi import FastAPI, Request, HTTPException
from fastapi.testclient import TestClient
from middleware.error_handler import (
    http_exception_handler,
    validation_exception_handler,
    general_exception_handler
)
from middleware.csrf import CSRFMiddleware
from middleware.request_context_middleware import RequestContextMiddleware
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError


@pytest.fixture
def app():
    """Create test FastAPI app"""
    app = FastAPI()
    # Set environment state for error handler
    app.state.environment = "development"
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)
    
    @app.get("/test")
    async def test_endpoint():
        return {"message": "ok"}
    
    @app.get("/test-error")
    async def test_error():
        raise HTTPException(status_code=404, detail="Not found")
    
    @app.get("/test-validation-error")
    async def test_validation_error(request: Request):
        raise RequestValidationError(errors=[])
    
    @app.get("/test-general-error")
    async def test_general_error():
        raise ValueError("General error")
    
    return app


def test_http_exception_handler(app):
    """Test HTTP exception handler"""
    client = TestClient(app)
    response = client.get("/test-error")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data or "detail" in data


def test_validation_exception_handler(app):
    """Test validation exception handler"""
    client = TestClient(app)
    # This will trigger validation error
    response = client.get("/test-validation-error")
    assert response.status_code == 422


def test_general_exception_handler(app):
    """Test general exception handler"""
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/test-general-error")
    assert response.status_code == 500
    data = response.json()
    assert "error" in data or "detail" in data


def test_normal_request(app):
    """Test normal request without errors"""
    client = TestClient(app)
    response = client.get("/test")
    assert response.status_code == 200
    assert response.json() == {"message": "ok"}


def test_error_handler_production_masks_internal_detail():
    app = FastAPI()
    app.state.environment = "production"
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)

    @app.get("/test-prod-500")
    async def test_prod_500():
        raise HTTPException(status_code=500, detail="sensitive backend details")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/test-prod-500")
    assert response.status_code == 500
    payload = response.json()
    assert payload["error"]["detail"] == "An internal server error occurred"


def test_error_handler_returns_request_id():
    app = FastAPI()
    app.state.environment = "production"
    app.add_exception_handler(Exception, general_exception_handler)
    app.add_middleware(RequestContextMiddleware)

    @app.get("/test-request-id-error")
    async def test_request_id_error():
        raise RuntimeError("boom")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/test-request-id-error")
    assert response.status_code == 500
    payload = response.json()
    assert isinstance(payload["error"].get("request_id"), str)
    assert len(payload["error"]["request_id"]) >= 8


def test_request_context_middleware_sets_x_request_id():
    app = FastAPI()
    app.add_middleware(RequestContextMiddleware)

    @app.get("/test-request-context")
    async def test_request_context():
        return {"ok": True}

    client = TestClient(app)
    response = client.get("/test-request-context")
    assert response.status_code == 200
    assert isinstance(response.headers.get("X-Request-ID"), str)
    assert len(response.headers.get("X-Request-ID", "")) >= 8


def test_csrf_http_exception_from_middleware_returns_403_not_500(monkeypatch):
    monkeypatch.setenv("CSRF_ENABLED", "true")

    app = FastAPI()
    app.state.environment = "production"
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(RequestContextMiddleware)

    @app.put("/test-write")
    async def test_write_endpoint():
        return {"ok": True}

    client = TestClient(app, raise_server_exceptions=False)
    response = client.put("/test-write")

    assert response.status_code == 403
    payload = response.json()
    assert payload["error"]["detail"] == "CSRF token missing"
    assert isinstance(response.headers.get("X-Request-ID"), str)

