"""create quizizz service tables

Revision ID: 0007_quizizz_service
Revises: 0006_remove_factor_grid_tasks
Create Date: 2026-10-03
"""
from alembic import op

revision = "0007_quizizz_service"
down_revision = "0006_remove_factor_grid_tasks"
branch_labels = None
depends_on = None

_DDL = [
    """
    CREATE TABLE IF NOT EXISTS quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        cover_image TEXT,
        created_by INTEGER NOT NULL,
        is_public BOOLEAN NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_quizzes_created_by ON quizzes(created_by)
    """,
    """
    CREATE TABLE IF NOT EXISTS quiz_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        question_type TEXT NOT NULL DEFAULT 'mcq',
        options TEXT,
        correct_answer TEXT NOT NULL,
        accepted_answers TEXT,
        time_limit_seconds INTEGER NOT NULL DEFAULT 30,
        points INTEGER NOT NULL DEFAULT 1000,
        sort_order INTEGER NOT NULL DEFAULT 0,
        image_filename TEXT,
        explanation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS quiz_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER NOT NULL,
        host_id INTEGER NOT NULL,
        pin_code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'lobby',
        settings TEXT DEFAULT '{}',
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        FOREIGN KEY (host_id) REFERENCES users(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_quiz_sessions_pin ON quiz_sessions(pin_code)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_quiz_sessions_host ON quiz_sessions(host_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS quiz_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        user_id INTEGER,
        nickname TEXT NOT NULL,
        avatar_color TEXT NOT NULL DEFAULT '#6366f1',
        score INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        total_answered INTEGER NOT NULL DEFAULT 0,
        is_finished BOOLEAN NOT NULL DEFAULT 0,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, nickname),
        FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_quiz_participants_session ON quiz_participants(session_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS quiz_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        participant_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        user_answer TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL DEFAULT 0,
        time_taken_seconds REAL NOT NULL DEFAULT 0,
        points_awarded INTEGER NOT NULL DEFAULT 0,
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, participant_id, question_id),
        FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES quiz_participants(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_quiz_answers_session_participant ON quiz_answers(session_id, participant_id)
    """,
]


def upgrade() -> None:
    for stmt in _DDL:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS quiz_answers")
    op.execute("DROP TABLE IF EXISTS quiz_participants")
    op.execute("DROP TABLE IF EXISTS quiz_sessions")
    op.execute("DROP TABLE IF EXISTS quiz_questions")
    op.execute("DROP TABLE IF EXISTS quizzes")
