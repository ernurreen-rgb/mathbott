"""
Pytest configuration and fixtures
"""
import pytest
import asyncio
import aiosqlite
from pathlib import Path
import tempfile
import os

from database import Database
from app import create_app
from routes import register_routes
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi.testclient import TestClient
from utils.cache import cache



@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def test_db():
    """Create a temporary test database"""
    # Create temporary database file
    fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    
    # Initialize database
    # Disable pooled connections in tests to avoid cross-loop/thread deadlocks with TestClient.
    db = Database(db_path=db_path, use_pool=False)
    setup_loop = asyncio.new_event_loop()
    setup_loop.run_until_complete(db.init())
    setup_loop.close()
    
    yield db
    
    # Cleanup
    try:
        os.unlink(db_path)
    except Exception:
        pass


@pytest.fixture
def test_user(test_db):
    """Create a test user"""
    loop = asyncio.new_event_loop()
    user = loop.run_until_complete(test_db.create_user_by_email("test@example.com"))
    loop.close()
    return user


@pytest.fixture
def client(test_db):
    """Create a test client wired to the test database"""
    cache.clear()
    app = create_app()
    # Use the test database and a fresh limiter for isolation
    app.state.db = test_db
    app.state.limiter = Limiter(key_func=get_remote_address)
    register_routes(app, app.state.db, app.state.limiter)
    return TestClient(app)

