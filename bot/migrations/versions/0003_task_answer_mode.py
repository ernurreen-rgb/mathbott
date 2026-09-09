"""add per-task answer mode

Revision ID: 0003_task_answer_mode
Revises: 0002_solo_trial_test_result_unique
Create Date: 2026-09-04
"""
from alembic import op


revision = "0003_task_answer_mode"
down_revision = "0002_solo_trial_test_result_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE bank_tasks
        ADD COLUMN answer_mode TEXT NOT NULL DEFAULT 'choices'
        CHECK (answer_mode IN ('choices', 'written'))
        """
    )
    op.execute(
        """
        UPDATE bank_tasks
        SET answer_mode = 'written'
        WHERE question_type IN ('input', 'factor_grid')
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE bank_tasks DROP COLUMN answer_mode")
