"""remove competitive ranking data

Revision ID: 0005_remove_competitive_features
Revises: 0004_task_accepted_answers
Create Date: 2026-09-11
"""
from alembic import op
from sqlalchemy import inspect


revision = "0005_remove_competitive_features"
down_revision = "0004_task_accepted_answers"
branch_labels = None
depends_on = None


_REMOVED_COLUMNS = ("league", "league_group", "week_solved", "week_points")
_REMOVED_ACHIEVEMENTS = (
    "top_league",
    "top_3",
    "bronze_league",
    "silver_league",
    "gold_league",
    "platinum_league",
)


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_users_league_group")
    op.execute("DROP INDEX IF EXISTS idx_users_total_points")
    op.execute("DROP INDEX IF EXISTS idx_users_week_points")
    op.execute("DROP TABLE IF EXISTS weekly_resets")

    placeholders = ", ".join(f"'{value}'" for value in _REMOVED_ACHIEVEMENTS)
    op.execute(f"DELETE FROM user_achievements WHERE achievement_id IN ({placeholders})")

    existing_columns = {
        column["name"] for column in inspect(op.get_bind()).get_columns("users")
    }
    for column_name in _REMOVED_COLUMNS:
        if column_name in existing_columns:
            op.execute(f"ALTER TABLE users DROP COLUMN {column_name}")


def downgrade() -> None:
    raise NotImplementedError(
        "This destructive cleanup is restored from the archive branch instead of downgraded."
    )
