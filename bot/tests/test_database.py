"""
Tests for database operations
"""
import pytest
from database import Database


@pytest.mark.asyncio
async def test_create_user(test_db):
    """Test user creation"""
    user = await test_db.create_user_by_email("test@example.com")
    assert user is not None
    assert user["email"] == "test@example.com"
    assert user["league"] == "Қола"


@pytest.mark.asyncio
async def test_get_user_by_email(test_db, test_user):
    """Test getting user by email"""
    user = await test_db.get_user_by_email("test@example.com")
    assert user is not None
    assert user["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_create_module(test_db):
    """Test module creation"""
    module = await test_db.create_module(
        name="Test Module",
        description="Test Description",
        icon="📚",
        sort_order=1
    )
    assert module is not None
    assert module["name"] == "Test Module"
    assert module["description"] == "Test Description"


@pytest.mark.asyncio
async def test_get_all_modules(test_db):
    """Test getting all modules"""
    # Create a module first
    await test_db.create_module("Test Module", sort_order=1)
    
    modules = await test_db.get_all_modules()
    assert len(modules) > 0
    assert any(m["name"] == "Test Module" for m in modules)


@pytest.mark.asyncio
async def test_update_user_nickname(test_db, test_user):
    """Test updating user nickname"""
    await test_db.update_user_nickname("test@example.com", "TestNick")
    user = await test_db.get_user_by_email("test@example.com")
    assert user["nickname"] == "TestNick"


@pytest.mark.asyncio
async def test_record_solution(test_db, test_user):
    """Test recording solution"""
    # Create a task first
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    # Record solution
    await test_db.record_solution(test_user["id"], task["id"], "42", True)
    
    # Check user stats updated
    user = await test_db.get_user_by_email("test@example.com")
    assert user["total_solved"] == 1
    assert user["total_points"] == 15


@pytest.mark.asyncio
async def test_update_task_progress(test_db, test_user):
    """Test updating task progress"""
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    await test_db.update_task_progress(test_user["id"], task["id"], "completed")
    
    progress = await test_db.get_user_task_progress(test_user["id"], task["id"])
    assert progress is not None
    assert progress["status"] == "completed"


@pytest.mark.asyncio
async def test_calculate_module_completion(test_db, test_user):
    """Test calculating module completion"""
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    
    # Initially should be 0% complete
    completion = await test_db.calculate_module_completion(test_user["id"], module["id"])
    assert completion["progress"] == 0.0
    assert completion["completed"] is False


@pytest.mark.asyncio
async def test_calculate_section_completion(test_db, test_user):
    """Test calculating section completion"""
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    
    # Initially should be 0% complete
    completion = await test_db.calculate_section_completion(test_user["id"], section["id"])
    assert completion["progress"] == 0.0
    assert completion["completed"] is False


@pytest.mark.asyncio
async def test_get_rating(test_db):
    """Test getting rating"""
    # Create users with nicknames
    user1 = await test_db.create_user_by_email("user1@example.com")
    user2 = await test_db.create_user_by_email("user2@example.com")
    await test_db.update_user_nickname("user1@example.com", "User1")
    await test_db.update_user_nickname("user2@example.com", "User2")
    
    rating = await test_db.get_rating(limit=10)
    assert len(rating) >= 2
    # Check that users with nicknames are in rating
    emails = [u["email"] for u in rating]
    assert "user1@example.com" in emails or "user2@example.com" in emails


@pytest.mark.asyncio
async def test_get_task_by_id(test_db, test_user):
    """Test getting task by ID"""
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    retrieved = await test_db.get_task_by_id(task["id"])
    assert retrieved is not None
    assert retrieved["id"] == task["id"]
    assert retrieved["text"] == "Test task"


@pytest.mark.asyncio
async def test_get_solved_task_ids(test_db, test_user):
    """Test getting solved task IDs"""
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    # Record correct solution
    await test_db.record_solution(test_user["id"], task["id"], "42", True)
    
    solved_ids = await test_db.get_solved_task_ids(test_user["id"])
    assert task["id"] in solved_ids

