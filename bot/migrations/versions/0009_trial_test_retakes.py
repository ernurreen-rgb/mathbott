"""Allow separate trial-test attempts and deduplicate retries of one attempt."""
from alembic import op

revision = "0009_trial_test_retakes"
down_revision = "0008_quiz_secure_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {row[1] for row in op.get_bind().exec_driver_sql("PRAGMA table_info(trial_test_results)")}
    if "attempt_id" not in columns:
        op.execute("ALTER TABLE trial_test_results ADD COLUMN attempt_id TEXT")
    op.execute("DROP INDEX IF EXISTS uq_trial_test_results_solo_user_test")
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_trial_test_results_solo_attempt
        ON trial_test_results(user_id, trial_test_id, attempt_id)
        WHERE submit_mode = 'solo' AND attempt_id IS NOT NULL""")


def downgrade() -> None:
    raise RuntimeError("Trial-test retakes cannot be downgraded without losing attempt history")
