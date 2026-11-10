"""Link bank task twins and record module mistake-review attempts."""
from alembic import op

revision = "0015_module_review"
down_revision = "0014_trial_test_folders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A twin belongs to exactly one source; review never chains twins of twins.
    op.execute("""CREATE TABLE bank_task_twins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_bank_task_id INTEGER NOT NULL REFERENCES bank_tasks(id) ON DELETE CASCADE,
        twin_bank_task_id INTEGER NOT NULL UNIQUE REFERENCES bank_tasks(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('draft', 'approved')),
        origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual', 'ai')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CHECK(source_bank_task_id <> twin_bank_task_id)
    )""")
    op.execute("CREATE INDEX idx_bank_task_twins_source ON bank_task_twins(source_bank_task_id, status, sort_order, id)")
    # Review attempts stay out of solutions so progress, streaks and achievements never change.
    op.execute("""CREATE TABLE module_review_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        bank_task_id INTEGER NOT NULL REFERENCES bank_tasks(id) ON DELETE CASCADE,
        answer TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")
    op.execute("CREATE INDEX idx_module_review_attempts_user_task ON module_review_attempts(user_id, task_id, id)")
    op.execute("CREATE INDEX idx_solutions_user_task_id ON solutions(user_id, task_id, id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_solutions_user_task_id")
    op.execute("DROP TABLE IF EXISTS module_review_attempts")
    op.execute("DROP TABLE IF EXISTS bank_task_twins")
