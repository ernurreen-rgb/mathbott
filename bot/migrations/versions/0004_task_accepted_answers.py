"""add accepted answer aliases to bank tasks

Revision ID: 0004_task_accepted_answers
Revises: 0003_task_answer_mode
Create Date: 2026-09-05
"""
from alembic import op


revision = "0004_task_accepted_answers"
down_revision = "0003_task_answer_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE bank_tasks
        ADD COLUMN accepted_answers TEXT NOT NULL DEFAULT '[]'
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE bank_tasks DROP COLUMN accepted_answers")
