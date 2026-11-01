"""Persist public quiz entry quotas across workers and server restarts."""
from alembic import op

revision = "0013_quiz_entry_limits"
down_revision = "0012_quiz_participant_question_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS quiz_entry_limits (
        client_key TEXT PRIMARY KEY CHECK(length(client_key) = 64),
        window_start INTEGER NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
        pin_codes TEXT NOT NULL DEFAULT '[]' CHECK(length(pin_codes) <= 9001),
        new_participants INTEGER NOT NULL DEFAULT 0 CHECK(new_participants >= 0),
        expires_at INTEGER NOT NULL
    )""")
    op.execute("CREATE INDEX IF NOT EXISTS idx_quiz_entry_limits_expires_at ON quiz_entry_limits(expires_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS quiz_entry_limits")
