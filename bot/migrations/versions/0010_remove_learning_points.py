"""Retire learning points while preserving unique task completions and progress."""
from alembic import op
from sqlalchemy import inspect

revision = "0010_remove_learning_points"
down_revision = "0009_trial_test_retakes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("user_task_rewards", "user_task_completions")
    op.execute("ALTER TABLE user_task_completions RENAME COLUMN reward_key TO completion_key")
    op.execute("ALTER TABLE user_task_completions RENAME COLUMN awarded_at TO completed_at")
    op.drop_column("user_task_completions", "points_awarded")
    op.drop_column("user_task_completions", "difficulty")
    op.drop_index("idx_user_task_rewards_user_id", table_name="user_task_completions")
    op.create_index("idx_user_task_completions_user_id", "user_task_completions", ["user_id"])
    for index in inspect(op.get_bind()).get_indexes("users"):
        if "total_points" in index.get("column_names", []):
            op.drop_index(index["name"], table_name="users")
    op.drop_column("users", "total_points")
    op.execute("DELETE FROM user_achievements WHERE achievement_id = 'thousand_points'")


def downgrade() -> None:
    raise RuntimeError("Learning points were retired; restore an archived database to recover historical balances")
