"""Retakes preserve results created before the one-attempt constraint is removed."""
import sqlite3

import pytest
from alembic import command

from migrations.runner import _build_config, run_migrations


def test_upgrade_preserves_saved_result_and_deduplicates_attempt_ids(tmp_path):
    path = str(tmp_path / "retakes.db")
    command.upgrade(_build_config(path), "0008_quiz_secure_sessions")
    with sqlite3.connect(path) as connection:
        connection.execute("INSERT INTO users (id, email) VALUES (1, 'migration@example.com')")
        connection.execute("INSERT INTO trial_tests (id, title, created_by) VALUES (1, 'Trial', 1)")
        connection.execute("""INSERT INTO trial_test_results
            (user_id, trial_test_id, score, total, percentage, answers)
            VALUES (1, 1, 0, 1, 0, '{}')""")

    run_migrations(path)
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT score, attempt_id FROM trial_test_results").fetchall() == [(0, None)]
        connection.execute("""INSERT INTO trial_test_results
            (user_id, trial_test_id, score, total, percentage, answers, attempt_id)
            VALUES (1, 1, 1, 1, 100, '{}', 'retake')""")
        connection.commit()
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("""INSERT INTO trial_test_results
                (user_id, trial_test_id, score, total, percentage, answers, attempt_id)
                VALUES (1, 1, 1, 1, 100, '{}', 'retake')""")
        assert connection.execute("SELECT score FROM trial_test_results ORDER BY id").fetchall() == [(0,), (1,)]
