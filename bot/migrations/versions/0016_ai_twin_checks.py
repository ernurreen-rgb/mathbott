"""Record which model drafted an AI twin and the result of its independent re-solve."""
from alembic import op

revision = "0016_ai_twin_checks"
down_revision = "0015_module_review"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE bank_task_twins ADD COLUMN ai_model TEXT")
    op.execute("ALTER TABLE bank_task_twins ADD COLUMN ai_check_status TEXT CHECK(ai_check_status IN ('match', 'mismatch', 'error'))")
    op.execute("ALTER TABLE bank_task_twins ADD COLUMN ai_check_answer TEXT")
    # The check describes this version; an edit afterwards makes it stale.
    op.execute("ALTER TABLE bank_task_twins ADD COLUMN ai_checked_version INTEGER")
    op.execute("ALTER TABLE bank_task_twins ADD COLUMN ai_checked_at TIMESTAMP")


def downgrade() -> None:
    for column in ("ai_checked_at", "ai_checked_version", "ai_check_answer", "ai_check_status", "ai_model"):
        op.execute(f"ALTER TABLE bank_task_twins DROP COLUMN {column}")
