"""Add category column to trial_tests for folder organization."""
from alembic import op
from sqlalchemy import inspect

revision = "0011_trial_test_category"
down_revision = "0010_remove_learning_points"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [c["name"] for c in insp.get_columns("trial_tests")]
    if "category" not in columns:
        op.execute("ALTER TABLE trial_tests ADD COLUMN category TEXT NOT NULL DEFAULT 'Жалпы'")


def downgrade() -> None:
    op.execute("ALTER TABLE trial_tests DROP COLUMN category")
