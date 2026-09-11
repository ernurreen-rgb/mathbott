"""remove obsolete factor-grid tasks and dependent records

Revision ID: 0006_remove_factor_grid_tasks
Revises: 0005_remove_competitive_features
Create Date: 2026-09-11
"""
from alembic import op


revision = "0006_remove_factor_grid_tasks"
down_revision = "0005_remove_competitive_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS temp.removed_factor_bank_tasks")
    op.execute("DROP TABLE IF EXISTS temp.removed_factor_tasks")
    op.execute("DROP TABLE IF EXISTS temp.removed_factor_trial_tasks")
    op.execute("DROP TABLE IF EXISTS temp.removed_factor_trial_tests")
    op.execute("DROP TABLE IF EXISTS temp.removed_factor_coop_sessions")

    op.execute(
        """
        CREATE TEMP TABLE removed_factor_bank_tasks AS
        SELECT id
        FROM bank_tasks
        WHERE LOWER(TRIM(question_type)) = 'factor_grid'
        """
    )
    op.execute(
        """
        CREATE TEMP TABLE removed_factor_tasks AS
        SELECT id
        FROM tasks
        WHERE bank_task_id IN (SELECT id FROM removed_factor_bank_tasks)
        """
    )
    op.execute(
        """
        CREATE TEMP TABLE removed_factor_trial_tasks AS
        SELECT id, trial_test_id
        FROM trial_test_tasks
        WHERE bank_task_id IN (SELECT id FROM removed_factor_bank_tasks)
        """
    )
    op.execute(
        """
        CREATE TEMP TABLE removed_factor_trial_tests AS
        SELECT DISTINCT trial_test_id AS id
        FROM removed_factor_trial_tasks
        """
    )
    op.execute(
        """
        CREATE TEMP TABLE removed_factor_coop_sessions AS
        SELECT id
        FROM trial_test_coop_sessions
        WHERE trial_test_id IN (SELECT id FROM removed_factor_trial_tests)
        """
    )

    # Lesson placements and their per-user state.
    op.execute("DELETE FROM reports WHERE task_id IN (SELECT id FROM removed_factor_tasks)")
    op.execute("DELETE FROM solutions WHERE task_id IN (SELECT id FROM removed_factor_tasks)")
    op.execute("DELETE FROM user_progress WHERE task_id IN (SELECT id FROM removed_factor_tasks)")
    op.execute(
        "DELETE FROM user_task_question_progress "
        "WHERE task_id IN (SELECT id FROM removed_factor_tasks)"
    )

    # A test attempt is no longer comparable once one of its tasks disappears.
    op.execute(
        "DELETE FROM trial_test_coop_invites "
        "WHERE session_id IN (SELECT id FROM removed_factor_coop_sessions)"
    )
    op.execute(
        "DELETE FROM trial_test_coop_answers "
        "WHERE session_id IN (SELECT id FROM removed_factor_coop_sessions) "
        "OR task_id IN (SELECT id FROM removed_factor_trial_tasks)"
    )
    op.execute(
        "DELETE FROM trial_test_coop_results "
        "WHERE session_id IN (SELECT id FROM removed_factor_coop_sessions)"
    )
    op.execute(
        "DELETE FROM trial_test_coop_participants "
        "WHERE session_id IN (SELECT id FROM removed_factor_coop_sessions)"
    )
    op.execute(
        "DELETE FROM trial_test_reports "
        "WHERE trial_test_id IN (SELECT id FROM removed_factor_trial_tests) "
        "OR trial_test_task_id IN (SELECT id FROM removed_factor_trial_tasks)"
    )
    op.execute(
        "DELETE FROM trial_test_drafts "
        "WHERE trial_test_id IN (SELECT id FROM removed_factor_trial_tests)"
    )
    op.execute(
        "DELETE FROM trial_test_results "
        "WHERE trial_test_id IN (SELECT id FROM removed_factor_trial_tests)"
    )
    op.execute(
        "DELETE FROM trial_test_coop_sessions "
        "WHERE id IN (SELECT id FROM removed_factor_coop_sessions)"
    )

    op.execute("DELETE FROM tasks WHERE id IN (SELECT id FROM removed_factor_tasks)")
    op.execute(
        "DELETE FROM trial_test_tasks "
        "WHERE id IN (SELECT id FROM removed_factor_trial_tasks)"
    )
    op.execute(
        "DELETE FROM bank_task_topic_map "
        "WHERE bank_task_id IN (SELECT id FROM removed_factor_bank_tasks)"
    )
    op.execute(
        "DELETE FROM bank_task_versions "
        "WHERE bank_task_id IN (SELECT id FROM removed_factor_bank_tasks)"
    )
    op.execute(
        "UPDATE user_task_rewards SET bank_task_id = NULL "
        "WHERE bank_task_id IN (SELECT id FROM removed_factor_bank_tasks)"
    )
    op.execute(
        """
        DELETE FROM admin_audit_logs
        WHERE (entity_type = 'bank_task' AND entity_id IN (SELECT id FROM removed_factor_bank_tasks))
           OR LOWER(summary) LIKE '%factor_grid%'
           OR LOWER(changed_fields_json) LIKE '%factor_grid%'
           OR LOWER(metadata_json) LIKE '%factor_grid%'
        """
    )
    op.execute("DELETE FROM bank_tasks WHERE id IN (SELECT id FROM removed_factor_bank_tasks)")

    op.execute("DROP TABLE temp.removed_factor_coop_sessions")
    op.execute("DROP TABLE temp.removed_factor_trial_tests")
    op.execute("DROP TABLE temp.removed_factor_trial_tasks")
    op.execute("DROP TABLE temp.removed_factor_tasks")
    op.execute("DROP TABLE temp.removed_factor_bank_tasks")


def downgrade() -> None:
    raise NotImplementedError(
        "Removed task records cannot be reconstructed without a database backup."
    )
