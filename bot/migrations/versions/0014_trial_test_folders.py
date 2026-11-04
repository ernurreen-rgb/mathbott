"""Persist the trial-test folder tree without changing test identities."""
from alembic import op

revision = "0014_trial_test_folders"
down_revision = "0013_quiz_entry_limits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE trial_test_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER REFERENCES trial_test_folders(id) ON DELETE RESTRICT,
        name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
        sort_order INTEGER NOT NULL DEFAULT 0,
        CHECK(parent_id IS NULL OR parent_id <> id)
    )""")
    op.execute("CREATE UNIQUE INDEX uq_trial_folder_root ON trial_test_folders(name) WHERE parent_id IS NULL")
    op.execute("CREATE UNIQUE INDEX uq_trial_folder_child ON trial_test_folders(parent_id, name) WHERE parent_id IS NOT NULL")
    op.execute("ALTER TABLE trial_tests ADD COLUMN folder_id INTEGER REFERENCES trial_test_folders(id) ON DELETE RESTRICT")
    op.execute("CREATE INDEX idx_trial_tests_folder ON trial_tests(folder_id)")
    op.execute("""INSERT INTO trial_test_folders (name, sort_order)
        SELECT COALESCE(NULLIF(TRIM(category), ''), 'Жалпы'), MIN(COALESCE(sort_order, 0))
        FROM trial_tests GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Жалпы')""")
    op.execute("""UPDATE trial_tests SET category = COALESCE(NULLIF(TRIM(category), ''), 'Жалпы'),
        folder_id = (SELECT id FROM trial_test_folders
            WHERE name = COALESCE(NULLIF(TRIM(trial_tests.category), ''), 'Жалпы') AND parent_id IS NULL)""")


def downgrade() -> None:
    # The legacy category column retains the root grouping for rollback.
    op.execute("DROP INDEX idx_trial_tests_folder")
    op.execute("ALTER TABLE trial_tests DROP COLUMN folder_id")
    op.execute("DROP TABLE trial_test_folders")
