"""Retiring XP preserves learning progress, attempt history and quiz scores."""
import sqlite3

import pytest
from alembic import command

from database import Database
from migrations.runner import _build_config, run_migrations


@pytest.mark.asyncio
async def test_upgrade_preserves_completions_and_quiz_scores(tmp_path):
    path = str(tmp_path / "learning-points.db")
    command.upgrade(_build_config(path), "0009_trial_test_retakes")
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO users (id, email, total_points, total_solved, streak) VALUES (1, 'migration@example.com', 500, 1, 7)")
        db.execute("INSERT INTO bank_tasks (id, text, answer, difficulty, question_type) VALUES (1, '2+2', '4', 'B', 'input')")
        db.execute("INSERT INTO tasks (id, bank_task_id) VALUES (1, 1)")
        db.execute("""INSERT INTO user_task_rewards (user_id, reward_key, difficulty, points_awarded, source, source_ref_id)
                      VALUES (1, 'bank:1', 'B', 15, 'module', 1)""")
        db.execute("INSERT INTO solutions (user_id, task_id, answer, is_correct) VALUES (1, 1, '4', 1)")
        db.execute("INSERT INTO user_progress (user_id, task_id, status) VALUES (1, 1, 'completed')")
        db.execute("INSERT INTO user_achievements (user_id, achievement_id) VALUES (1, 'thousand_points'), (1, 'first_solve')")
        db.execute("INSERT INTO trial_tests (id, title) VALUES (1, 'Saved test')")
        db.execute("""INSERT INTO trial_test_results (user_id, trial_test_id, score, total, percentage, answers)
                      VALUES (1, 1, 1, 1, 100, '{}')""")
        db.execute("INSERT INTO quizzes (id, title, created_by) VALUES (1, 'Quiz', 1)")
        db.execute("INSERT INTO quiz_questions (id, quiz_id, question_text, correct_answer) VALUES (1, 1, '2+2', '4')")
        db.execute("INSERT INTO quiz_sessions (id, quiz_id, host_id, pin_code) VALUES (1, 1, 1, '123456')")
        db.execute("INSERT INTO quiz_session_questions (session_id, question_id, position, snapshot_json) VALUES (1, 1, 0, '{}')")
        db.execute("INSERT INTO quiz_participants (id, session_id, nickname, score) VALUES (1, 1, 'Player', 950)")
        db.execute("INSERT INTO quiz_answers (session_id, participant_id, question_id, user_answer, is_correct, points_awarded) VALUES (1, 1, 1, '4', 1, 950)")

    run_migrations(path)
    run_migrations(path)
    with sqlite3.connect(path) as db:
        assert "total_points" not in {row[1] for row in db.execute("PRAGMA table_info(users)")}
        assert db.execute("SELECT total_solved, streak FROM users").fetchone() == (1, 7)
        assert db.execute("SELECT completion_key, source_ref_id FROM user_task_completions").fetchall() == [("bank:1", 1)]
        assert db.execute("SELECT COUNT(*) FROM solutions").fetchone()[0] == 1
        assert db.execute("SELECT status FROM user_progress").fetchone()[0] == "completed"
        assert db.execute("SELECT score, percentage FROM trial_test_results").fetchone() == (1, 100)
        assert db.execute("SELECT score FROM quiz_participants").fetchone()[0] == 950
        assert db.execute("SELECT points_awarded FROM quiz_answers").fetchone()[0] == 950
        assert db.execute("SELECT achievement_id FROM user_achievements").fetchall() == [("first_solve",)]
        assert not db.execute("PRAGMA foreign_key_check").fetchall()

    app_db = Database(path, use_pool=False)
    await app_db.record_solution(1, 1, "4", True)
    assert (await app_db.users.get_user_by_id(1))["total_solved"] == 1


@pytest.mark.asyncio
async def test_user_surfaces_and_exports_have_no_learning_points(client, test_db, test_user):
    private = client.get(f"/api/user/web/{test_user['email']}")
    public = client.get(f"/api/user/public/{test_user['id']}")
    exported = client.get(f"/api/export/user/{test_user['email']}", params={"format": "json"})
    for response in (private, public, exported):
        assert response.status_code == 200
        assert "total_points" not in response.text
        assert "thousand_points" not in response.text
    assert exported.json()["user"]["total_solved"] == 0
    csv_export = client.get(f"/api/export/user/{test_user['email']}", params={"format": "csv"})
    assert csv_export.status_code == 200
    assert "Total Points" not in csv_export.text


@pytest.mark.asyncio
async def test_completion_counter_is_concurrent_and_deduplicated(test_db, test_user):
    import asyncio
    payload = {"user_id": test_user["id"], "completion_key": "module-task:42", "bank_task_id": None,
               "source": "module", "source_ref_id": 42}
    results = await asyncio.gather(*(test_db.users.record_task_completion_once(**payload) for _ in range(5)))
    assert sum(result["recorded"] for result in results) == 1
    user = await test_db.users.get_user_by_id(test_user["id"])
    assert user["total_solved"] == 1
    assert "total_points" not in user
