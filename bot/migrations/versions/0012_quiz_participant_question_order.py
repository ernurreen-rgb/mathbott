"""Add question_order column to quiz_participants for per-student shuffling."""
from alembic import op
from sqlalchemy import inspect

revision = "0012_quiz_participant_question_order"
down_revision = "0011_trial_test_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [c["name"] for c in insp.get_columns("quiz_participants")]
    if "question_order" not in columns:
        op.execute("ALTER TABLE quiz_participants ADD COLUMN question_order TEXT DEFAULT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE quiz_participants DROP COLUMN question_order")
