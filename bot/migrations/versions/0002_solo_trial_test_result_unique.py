"""make solo trial-test submissions one-shot

Revision ID: 0002_solo_trial_test_result_unique
Revises: 0001_baseline
Create Date: 2026-06-18
"""
from alembic import op

revision = "0002_solo_trial_test_result_unique"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE trial_test_results
        ADD COLUMN submit_mode TEXT NOT NULL DEFAULT 'solo'
        """
    )
    op.execute(
        """
        UPDATE trial_test_results
        SET submit_mode = 'coop'
        WHERE id IN (
            SELECT trial_test_result_id
            FROM trial_test_coop_results
        )
        """
    )
    op.execute(
        """
        DELETE FROM trial_test_results
        WHERE submit_mode = 'solo'
          AND id NOT IN (
              SELECT MIN(id)
              FROM trial_test_results
              WHERE submit_mode = 'solo'
              GROUP BY user_id, trial_test_id
          )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_trial_test_results_solo_user_test
        ON trial_test_results(user_id, trial_test_id)
        WHERE submit_mode = 'solo'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_trial_test_results_solo_user_test")
