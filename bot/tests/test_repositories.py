"""
Tests for repository classes
"""
import pytest
from repositories.user_repository import (
    AdminRoleConflictError,
    LastSuperAdminError,
    UserRepository,
)
from repositories.task_repository import TaskRepository
from repositories.rating_repository import RatingRepository
from repositories.progress_repository import ProgressRepository


@pytest.mark.asyncio
async def test_user_repository_get_user_by_email(test_db):
    """Test getting user by email"""
    repo = UserRepository(db_path=test_db.db_path)
    
    # Create user
    user = await test_db.create_user_by_email("test@example.com")
    
    # Get user by email
    retrieved = await repo.get_user_by_email("test@example.com")
    assert retrieved is not None
    assert retrieved["email"] == "test@example.com"
    assert retrieved["id"] == user["id"]


@pytest.mark.asyncio
async def test_user_repository_get_user_by_id(test_db):
    """Test getting user by ID"""
    repo = UserRepository(db_path=test_db.db_path)
    
    # Create user
    user = await test_db.create_user_by_email("test@example.com")
    
    # Get user by ID
    retrieved = await repo.get_user_by_id(user["id"])
    assert retrieved is not None
    assert retrieved["email"] == "test@example.com"
    assert retrieved["id"] == user["id"]


@pytest.mark.asyncio
async def test_user_repository_create_user_by_email(test_db):
    """Test creating user by email"""
    repo = UserRepository(db_path=test_db.db_path)
    
    # Create user
    user = await repo.create_user_by_email("newuser@example.com")
    assert user is not None
    assert user["email"] == "newuser@example.com"
    assert user["league"] == "Қола"
    
    # Try to create again (should return existing)
    existing = await repo.create_user_by_email("newuser@example.com")
    assert existing["id"] == user["id"]


@pytest.mark.asyncio
async def test_user_repository_update_nickname(test_db):
    """Test updating user nickname"""
    repo = UserRepository(db_path=test_db.db_path)
    
    # Create user
    user = await repo.create_user_by_email("test@example.com")
    
    # Update nickname
    await repo.update_user_nickname("test@example.com", "TestNick")
    
    # Verify update
    updated = await repo.get_user_by_email("test@example.com")
    assert updated["nickname"] == "TestNick"


@pytest.mark.asyncio
async def test_user_repository_get_all_users(test_db):
    """Test getting all users"""
    repo = UserRepository(db_path=test_db.db_path)
    
    # Create multiple users
    await repo.create_user_by_email("user1@example.com")
    await repo.create_user_by_email("user2@example.com")
    
    # Get all users
    users = await repo.get_all_users()
    assert len(users) >= 2
    emails = [u["email"] for u in users]
    assert "user1@example.com" in emails
    assert "user2@example.com" in emails


@pytest.mark.asyncio
async def test_user_repository_is_admin(test_db):
    """Test checking admin status"""
    repo = UserRepository(db_path=test_db.db_path)
    
    # Create user
    user = await repo.create_user_by_email("test@example.com")
    
    # Check admin status (should be False)
    is_admin = await repo.is_admin(email="test@example.com")
    assert is_admin is False
    
    # Set as admin
    await repo.set_admin(email="test@example.com", is_admin=True)
    
    # Check admin status again
    is_admin = await repo.is_admin(email="test@example.com")
    assert is_admin is True

    role = await repo.get_admin_role(email="test@example.com")
    assert role == "super_admin"


@pytest.mark.asyncio
async def test_user_repository_set_admin_role(test_db):
    """Test explicit RBAC role assignment."""
    repo = UserRepository(db_path=test_db.db_path)

    await repo.create_user_by_email("roleuser@example.com")
    await repo.set_admin_role(email="roleuser@example.com", role="reviewer")

    is_admin = await repo.is_admin(email="roleuser@example.com")
    role = await repo.get_admin_role(email="roleuser@example.com")
    assert is_admin is True
    assert role == "reviewer"

    await repo.set_admin_with_role(email="roleuser@example.com", is_admin=False)
    is_admin = await repo.is_admin(email="roleuser@example.com")
    role = await repo.get_admin_role(email="roleuser@example.com")
    assert is_admin is False
    assert role is None


@pytest.mark.asyncio
async def test_user_repository_list_admin_users_filters_and_pagination(test_db):
    """Test admin users listing with filters and pagination."""
    repo = UserRepository(db_path=test_db.db_path)

    await repo.create_user_by_email("admin.super@example.com")
    await repo.create_user_by_email("admin.reviewer@example.com")
    await repo.create_user_by_email("regular.user@example.com")

    await repo.set_admin_with_role(email="admin.super@example.com", is_admin=True, role="super_admin")
    await repo.set_admin_with_role(email="admin.reviewer@example.com", is_admin=True, role="reviewer")

    filtered = await repo.list_admin_users(search="reviewer", limit=20, offset=0)
    assert filtered["total"] == 1
    assert len(filtered["items"]) == 1
    assert filtered["items"][0]["email"] == "admin.reviewer@example.com"
    assert filtered["items"][0]["role"] == "reviewer"

    page_a = await repo.list_admin_users(limit=1, offset=0)
    page_b = await repo.list_admin_users(limit=1, offset=1)
    assert page_a["total"] == 2
    assert len(page_a["items"]) == 1
    assert len(page_b["items"]) == 1
    assert page_a["items"][0]["email"] != page_b["items"][0]["email"]

    reviewers = await repo.list_admin_users(role="reviewer", limit=20, offset=0)
    assert reviewers["total"] == 1
    assert reviewers["items"][0]["email"] == "admin.reviewer@example.com"


@pytest.mark.asyncio
async def test_user_repository_change_admin_role_with_audit(test_db):
    """Test role change service with audit insert and no-op behavior."""
    repo = UserRepository(db_path=test_db.db_path)

    actor = await repo.create_user_by_email("actor.super@example.com")
    await repo.set_admin_with_role(email=actor["email"], is_admin=True, role="super_admin")

    await repo.create_user_by_email("target.editor@example.com")
    await repo.set_admin_with_role(email="target.editor@example.com", is_admin=True, role="content_editor")

    changed = await repo.change_admin_role_with_audit(
        target_email="target.editor@example.com",
        role="reviewer",
        set_admin=True,
        actor_user_id=actor["id"],
        actor_email=actor["email"],
        source="admin_roles_ui",
        actor_verified=True,
    )
    assert changed["changed"] is True
    assert changed["previous_role"] == "content_editor"
    assert changed["new_role"] == "reviewer"
    assert isinstance(changed["audit_id"], int)

    role = await repo.get_admin_role(email="target.editor@example.com")
    assert role == "reviewer"

    # No-op update should not create a new audit event.
    same = await repo.change_admin_role_with_audit(
        target_email="target.editor@example.com",
        role="reviewer",
        set_admin=True,
        actor_user_id=actor["id"],
        actor_email=actor["email"],
        source="admin_roles_ui",
        actor_verified=True,
    )
    assert same["changed"] is False
    assert same["audit_id"] is None

    import aiosqlite
    async with aiosqlite.connect(test_db.db_path) as db_conn:
        async with db_conn.execute(
            "SELECT COUNT(*) FROM admin_audit_logs WHERE action = 'role_change' AND entity_type = 'admin_user' AND entity_id = ?",
            (changed["target_user"]["id"],),
        ) as cursor:
            row = await cursor.fetchone()
            assert int(row[0]) == 1

    removed = await repo.change_admin_role_with_audit(
        target_email="target.editor@example.com",
        role=None,
        set_admin=False,
        actor_user_id=actor["id"],
        actor_email=actor["email"],
        source="admin_roles_ui",
        actor_verified=True,
    )
    assert removed["changed"] is True
    assert removed["new_role"] is None
    assert removed["new_is_admin"] is False
    assert isinstance(removed["audit_id"], int)

    is_admin_after = await repo.is_admin(email="target.editor@example.com")
    role_after = await repo.get_admin_role(email="target.editor@example.com")
    assert is_admin_after is False
    assert role_after is None


@pytest.mark.asyncio
async def test_user_repository_change_admin_role_last_super_guard(test_db):
    repo = UserRepository(db_path=test_db.db_path)

    super_user = await repo.create_user_by_email("last.super@example.com")
    await repo.set_admin_with_role(email=super_user["email"], is_admin=True, role="super_admin")

    with pytest.raises(LastSuperAdminError):
        await repo.change_admin_role_with_audit(
            target_email=super_user["email"],
            role="reviewer",
            set_admin=True,
            actor_user_id=super_user["id"],
            actor_email=super_user["email"],
            source="admin_roles_ui",
            actor_verified=True,
        )

    backup_super = await repo.create_user_by_email("backup.super@example.com")
    await repo.set_admin_with_role(email=backup_super["email"], is_admin=True, role="super_admin")

    changed = await repo.change_admin_role_with_audit(
        target_email=super_user["email"],
        role="reviewer",
        set_admin=True,
        actor_user_id=backup_super["id"],
        actor_email=backup_super["email"],
        source="admin_roles_ui",
        actor_verified=True,
    )
    assert changed["changed"] is True
    assert changed["new_role"] == "reviewer"


@pytest.mark.asyncio
async def test_user_repository_change_admin_role_expected_state_conflict(test_db):
    repo = UserRepository(db_path=test_db.db_path)

    actor = await repo.create_user_by_email("conflict.actor@example.com")
    await repo.set_admin_with_role(email=actor["email"], is_admin=True, role="super_admin")

    await repo.create_user_by_email("conflict.target@example.com")
    await repo.set_admin_with_role(email="conflict.target@example.com", is_admin=True, role="reviewer")

    with pytest.raises(AdminRoleConflictError):
        await repo.change_admin_role_with_audit(
            target_email="conflict.target@example.com",
            role="content_editor",
            set_admin=True,
            actor_user_id=actor["id"],
            actor_email=actor["email"],
            source="admin_roles_restore",
            actor_verified=True,
            expected_current_role="content_editor",
            expected_current_is_admin=True,
            restored_from_audit_id=101,
        )

    with pytest.raises(AdminRoleConflictError):
        await repo.change_admin_role_with_audit(
            target_email="conflict.target@example.com",
            role="content_editor",
            set_admin=True,
            actor_user_id=actor["id"],
            actor_email=actor["email"],
            source="admin_roles_restore",
            actor_verified=True,
            expected_current_role="reviewer",
            expected_current_is_admin=False,
            restored_from_audit_id=102,
        )


@pytest.mark.asyncio
async def test_user_repository_change_admin_role_restore_metadata(test_db):
    repo = UserRepository(db_path=test_db.db_path)

    actor = await repo.create_user_by_email("restore.actor@example.com")
    await repo.set_admin_with_role(email=actor["email"], is_admin=True, role="super_admin")

    target = await repo.create_user_by_email("restore.target@example.com")
    await repo.set_admin_with_role(email=target["email"], is_admin=True, role="reviewer")

    changed = await repo.change_admin_role_with_audit(
        target_email=target["email"],
        role="content_editor",
        set_admin=True,
        actor_user_id=actor["id"],
        actor_email=actor["email"],
        source="admin_roles_restore",
        actor_verified=True,
        expected_current_role="reviewer",
        expected_current_is_admin=True,
        restored_from_audit_id=777,
    )
    assert changed["changed"] is True
    assert isinstance(changed["audit_id"], int)

    audit_item = await repo.get_admin_audit_log_by_id(int(changed["audit_id"]))
    assert audit_item is not None
    metadata = audit_item.get("metadata") or {}
    assert metadata.get("source") == "admin_roles_restore"
    assert metadata.get("restored_from_audit_id") == 777
    assert metadata.get("restore_expected_to_role") == "reviewer"
    assert metadata.get("restore_expected_to_is_admin") is True

@pytest.mark.asyncio
async def test_user_repository_get_solved_task_ids(test_db, test_user):
    """Test getting solved task IDs"""
    repo = UserRepository(db_path=test_db.db_path)
    
    # Create task and solve it
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    # Record solution
    await test_db.record_solution(test_user["id"], task["id"], "42", True)
    
    # Get solved task IDs
    solved_ids = await repo.get_solved_task_ids(test_user["id"])
    assert task["id"] in solved_ids


@pytest.mark.asyncio
async def test_user_repository_award_task_reward_once_deduplicates(test_db, test_user):
    repo = UserRepository(db_path=test_db.db_path)

    first = await repo.award_task_reward_once(
        user_id=test_user["id"],
        reward_key="bank:123",
        bank_task_id=None,
        difficulty="C",
        points=20,
        source="trial_test",
        source_ref_id=77,
    )
    assert first == {"awarded": True, "points": 20}

    user_after_first = await test_db.get_user_by_id(test_user["id"])
    assert user_after_first["total_points"] == 20
    assert user_after_first["week_points"] == 20
    assert user_after_first["total_solved"] == 1
    assert user_after_first["week_solved"] == 1

    second = await repo.award_task_reward_once(
        user_id=test_user["id"],
        reward_key="bank:123",
        bank_task_id=None,
        difficulty="C",
        points=20,
        source="trial_test",
        source_ref_id=77,
    )
    assert second == {"awarded": False, "points": 0}

    user_after_second = await test_db.get_user_by_id(test_user["id"])
    assert user_after_second["total_points"] == 20
    assert user_after_second["week_points"] == 20
    assert user_after_second["total_solved"] == 1
    assert user_after_second["week_solved"] == 1


@pytest.mark.asyncio
async def test_record_solution_uses_difficulty_and_blocks_repeat_points(test_db, test_user):
    module = await test_db.create_module("Scoring Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Scoring Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"],
        "Scoring task",
        "42",
        test_user["id"],
        bank_difficulty="A",
    )

    await test_db.record_solution(test_user["id"], task["id"], "42", True)
    after_first = await test_db.get_user_by_id(test_user["id"])
    assert after_first["total_points"] == 10
    assert after_first["total_solved"] == 1

    await test_db.record_solution(test_user["id"], task["id"], "42", True)
    after_second = await test_db.get_user_by_id(test_user["id"])
    assert after_second["total_points"] == 10
    assert after_second["total_solved"] == 1


@pytest.mark.asyncio
async def test_task_repository_get_task_by_id(test_db, test_user):
    """Test getting task by ID"""
    repo = TaskRepository(db_path=test_db.db_path)
    
    # Create task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    # Get task by ID
    retrieved = await repo.get_task_by_id(task["id"])
    assert retrieved is not None
    assert retrieved["id"] == task["id"]
    assert retrieved["text"] == "Test task"
    assert retrieved["answer"] == "42"


@pytest.mark.asyncio
async def test_task_repository_get_random_task(test_db, test_user):
    """Test getting random task"""
    repo = TaskRepository(db_path=test_db.db_path)
    
    # Create multiple tasks
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task1 = await test_db.create_task_in_section(
        section["id"], "Task 1", "1", test_user["id"]
    )
    task2 = await test_db.create_task_in_section(
        section["id"], "Task 2", "2", test_user["id"]
    )
    
    # Get random task
    random_task = await repo.get_random_task()
    assert random_task is not None
    assert random_task["id"] in [task1["id"], task2["id"]]
    
    # Get random task excluding specific IDs
    random_task_excluded = await repo.get_random_task(exclude_ids=[task1["id"]])
    assert random_task_excluded is not None
    assert random_task_excluded["id"] == task2["id"]


@pytest.mark.asyncio
async def test_task_repository_create_task(test_db, test_user):
    """Test creating task"""
    repo = TaskRepository(db_path=test_db.db_path)
    
    # Create module and section
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    
    # Create task
    task = await repo.create_task(
        text="What is 2+2?",
        answer="4",
        created_by=test_user["id"],
        section_id=section["id"],
        question_type="input"
    )
    
    assert task is not None
    assert task["text"] == "What is 2+2?"
    assert task["answer"] == "4"
    assert task["section_id"] == section["id"]


@pytest.mark.asyncio
async def test_task_repository_update_task(test_db, test_user):
    """Test updating task"""
    repo = TaskRepository(db_path=test_db.db_path)
    
    # Create task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    # Update task
    await repo.update_task(
        task["id"],
        text="Updated task",
        answer="43"
    )
    
    # Verify update
    updated = await repo.get_task_by_id(task["id"])
    assert updated["text"] == "Updated task"
    assert updated["answer"] == "43"


@pytest.mark.asyncio
async def test_task_repository_soft_delete_task(test_db, test_user):
    """Test soft deleting task"""
    repo = TaskRepository(db_path=test_db.db_path)
    
    # Create task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    # Soft delete task
    await repo.soft_delete_task(task["id"])
    
    # Verify task is deleted (should not appear in get_random_task)
    # But should still exist in database
    deleted_task = await repo.get_task_by_id(task["id"])
    assert deleted_task is not None
    assert deleted_task.get("deleted_at") is not None


@pytest.mark.asyncio
async def test_task_repository_restore_task(test_db, test_user):
    """Test restoring task from trash"""
    repo = TaskRepository(db_path=test_db.db_path)
    
    # Create and delete task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    await repo.soft_delete_task(task["id"])
    
    # Restore task
    await repo.restore_task(task["id"])
    
    # Verify task is restored
    restored = await repo.get_task_by_id(task["id"])
    assert restored is not None
    assert restored.get("deleted_at") is None


@pytest.mark.asyncio
async def test_task_repository_check_answer(test_db, test_user):
    """Test checking answer"""
    repo = TaskRepository(db_path=test_db.db_path)
    
    # Create task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    # Check correct answer
    is_correct = await repo.check_answer(task["id"], "42")
    assert is_correct is True
    
    # Check incorrect answer
    is_correct = await repo.check_answer(task["id"], "43")
    assert is_correct is False


@pytest.mark.asyncio
async def test_task_repository_get_tasks_by_section(test_db, test_user):
    """Test getting tasks by section"""
    repo = TaskRepository(db_path=test_db.db_path)
    
    # Create module and section
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    
    # Create multiple tasks
    task1 = await test_db.create_task_in_section(
        section["id"], "Task 1", "1", test_user["id"]
    )
    task2 = await test_db.create_task_in_section(
        section["id"], "Task 2", "2", test_user["id"]
    )
    
    # Get tasks by section
    tasks = await repo.get_tasks_by_section(section["id"])
    assert len(tasks) >= 2
    task_ids = [t["id"] for t in tasks]
    assert task1["id"] in task_ids
    assert task2["id"] in task_ids


@pytest.mark.asyncio
async def test_rating_repository_get_rating(test_db):
    """Test getting rating"""
    repo = RatingRepository(db_path=test_db.db_path)
    
    # Create users with nicknames
    user1 = await test_db.create_user_by_email("user1@example.com")
    user2 = await test_db.create_user_by_email("user2@example.com")
    await test_db.update_user_nickname("user1@example.com", "User1")
    await test_db.update_user_nickname("user2@example.com", "User2")
    
    # Get rating
    rating = await repo.get_rating(limit=10)
    assert len(rating) >= 2
    
    # Test pagination
    rating_page1 = await repo.get_rating(limit=1, offset=0)
    rating_page2 = await repo.get_rating(limit=1, offset=1)
    assert len(rating_page1) == 1
    assert len(rating_page2) == 1
    assert rating_page1[0]["id"] != rating_page2[0]["id"]


@pytest.mark.asyncio
async def test_rating_repository_get_rating_count(test_db):
    """Test getting rating count"""
    repo = RatingRepository(db_path=test_db.db_path)
    
    # Create users
    await test_db.create_user_by_email("user1@example.com")
    await test_db.create_user_by_email("user2@example.com")
    await test_db.update_user_nickname("user1@example.com", "User1")
    await test_db.update_user_nickname("user2@example.com", "User2")
    
    # Get count
    count = await repo.get_rating_count()
    assert count >= 2
    
    # Test league filter
    count_kola = await repo.get_rating_count(league="Қола")
    assert count_kola >= 2


@pytest.mark.asyncio
async def test_rating_repository_get_user_stats(test_db, test_user):
    """Test getting user stats"""
    repo = RatingRepository(db_path=test_db.db_path)
    
    # Get user stats
    stats = await repo.get_user_stats(test_user["id"])
    assert stats is not None
    assert stats["id"] == test_user["id"]
    assert "league_position" in stats
    assert "league_size" in stats


@pytest.mark.asyncio
async def test_progress_repository_update_task_progress(test_db, test_user):
    """Test updating task progress"""
    repo = ProgressRepository(db_path=test_db.db_path)
    
    # Create task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Test task", "42", test_user["id"]
    )
    
    # Update progress
    await repo.update_task_progress(test_user["id"], task["id"], "completed")
    
    # Verify progress
    progress = await repo.get_user_task_progress(test_user["id"], task["id"])
    assert progress is not None
    assert progress["status"] == "completed"


@pytest.mark.asyncio
async def test_progress_repository_get_user_progress_for_section(test_db, test_user):
    """Test getting user progress for section"""
    repo = ProgressRepository(db_path=test_db.db_path)
    
    # Create module and section
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    
    # Create tasks
    task1 = await test_db.create_task_in_section(
        section["id"], "Task 1", "1", test_user["id"]
    )
    task2 = await test_db.create_task_in_section(
        section["id"], "Task 2", "2", test_user["id"]
    )
    
    # Update progress for one task
    await repo.update_task_progress(test_user["id"], task1["id"], "completed")
    
    # Get progress for section
    progress = await repo.get_user_progress_for_section(test_user["id"], section["id"])
    assert task1["id"] in progress
    assert progress[task1["id"]] == "completed"


@pytest.mark.asyncio
async def test_progress_repository_calculate_section_completion(test_db, test_user):
    """Test calculating section completion"""
    repo = ProgressRepository(db_path=test_db.db_path)
    
    # Create module and section
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    
    # Initially should be 0% complete
    completion = await repo.calculate_section_completion(test_user["id"], section["id"])
    assert completion["progress"] == 0.0
    assert completion["completed"] is False


@pytest.mark.asyncio
async def test_progress_repository_calculate_mini_lesson_completion(test_db, test_user):
    """Test calculating mini-lesson completion"""
    repo = ProgressRepository(db_path=test_db.db_path)
    
    # Create module, section, lesson, and mini-lesson
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    lesson = await test_db.create_lesson(
        section["id"], lesson_number=1, title="Test Lesson", sort_order=1
    )
    await test_db.ensure_default_mini_lessons(lesson["id"])
    mini_lessons = await test_db.get_mini_lessons_by_lesson(lesson["id"])
    
    # Initially should be 0% complete
    completion = await repo.calculate_mini_lesson_completion(test_user["id"], mini_lessons[0]["id"])
    assert completion["progress"] == 0.0
    assert completion["completed"] is False


# ----- Trial test draft -----


@pytest.mark.asyncio
async def test_trial_test_draft_get_empty(test_db, test_user):
    """GET draft when none exists returns empty"""
    trial = await test_db.create_trial_test("Draft Test", sort_order=0, created_by=test_user["id"])
    draft = await test_db.get_trial_test_draft(test_user["id"], trial["id"])
    assert draft is None


@pytest.mark.asyncio
async def test_trial_test_draft_upsert_and_get(test_db, test_user):
    """Upsert draft then get returns same data"""
    trial = await test_db.create_trial_test("Draft Test", sort_order=0, created_by=test_user["id"])
    task = await test_db.create_trial_test_task(trial["id"], "Q1", "42", "input", sort_order=0)
    answers = {task["id"]: "42"}
    await test_db.upsert_trial_test_draft(test_user["id"], trial["id"], answers, current_task_index=0)
    draft = await test_db.get_trial_test_draft(test_user["id"], trial["id"])
    assert draft is not None
    import json
    ans = draft.get("answers") or "{}"
    parsed = json.loads(ans) if isinstance(ans, str) else ans
    assert str(task["id"]) in parsed
    assert parsed[str(task["id"])] == "42"
    assert draft.get("current_task_index") == 0


@pytest.mark.asyncio
async def test_trial_test_draft_delete(test_db, test_user):
    """After delete_draft, get returns None"""
    trial = await test_db.create_trial_test("Draft Test", sort_order=0, created_by=test_user["id"])
    await test_db.upsert_trial_test_draft(test_user["id"], trial["id"], {1: "x"}, current_task_index=0)
    await test_db.delete_trial_test_draft(test_user["id"], trial["id"])
    draft = await test_db.get_trial_test_draft(test_user["id"], trial["id"])
    assert draft is None
