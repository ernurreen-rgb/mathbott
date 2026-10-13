"""Freeze quiz questions and persist participant credentials and clocks."""
import json
from alembic import op

revision = "0008_quiz_secure_sessions"
down_revision = "0007_quizizz_service"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    columns = {row[1] for row in connection.exec_driver_sql('PRAGMA table_info(quiz_participants)')}
    for name, definition in (
        ('token_hash', 'TEXT'), ('current_question_index', 'INTEGER NOT NULL DEFAULT 0'), ('question_started_at', 'REAL'),
    ):
        if name not in columns:
            op.execute(f"ALTER TABLE quiz_participants ADD COLUMN {name} {definition}")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_participant_token ON quiz_participants(token_hash)")
    op.execute("""CREATE TABLE IF NOT EXISTS quiz_session_questions (
        session_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY(session_id, question_id),
        UNIQUE(session_id, position),
        FOREIGN KEY(session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE
    )""")
    sessions = connection.exec_driver_sql("SELECT id, quiz_id FROM quiz_sessions").fetchall()
    for session_id, quiz_id in sessions:
        questions = connection.exec_driver_sql(
            "SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order, id", (quiz_id,),
        ).mappings().all()
        for position, row in enumerate(questions):
            question = dict(row)
            for key in ("options", "accepted_answers"):
                question[key] = json.loads(question.get(key) or "[]")
            connection.exec_driver_sql(
                "INSERT OR IGNORE INTO quiz_session_questions VALUES (?, ?, ?, ?)",
                (session_id, question["id"], position, json.dumps(question, ensure_ascii=False)),
            )
    # Detach answers from mutable author questions: deletion must not erase scores.
    needs_rebuild = any(row[2] == 'quiz_questions' for row in connection.exec_driver_sql('PRAGMA foreign_key_list(quiz_answers)'))
    if needs_rebuild:
        op.execute("ALTER TABLE quiz_answers RENAME TO quiz_answers_legacy")
        op.execute("""CREATE TABLE quiz_answers (
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
        FOREIGN KEY(session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(participant_id) REFERENCES quiz_participants(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id, question_id) REFERENCES quiz_session_questions(session_id, question_id) ON DELETE CASCADE
    )""")
        op.execute("INSERT INTO quiz_answers SELECT * FROM quiz_answers_legacy")
        op.execute("DROP TABLE quiz_answers_legacy")
    op.execute("CREATE INDEX IF NOT EXISTS idx_quiz_answers_session_participant ON quiz_answers(session_id, participant_id)")
    # Legacy guests must rejoin; their old identifier was never a credential.
    # Registered participants may recover through their authenticated account.
    op.execute("""UPDATE quiz_participants SET current_question_index = COALESCE((
        SELECT MIN(q.position) FROM quiz_session_questions q
        WHERE q.session_id = quiz_participants.session_id AND NOT EXISTS (
            SELECT 1 FROM quiz_answers a WHERE a.session_id = q.session_id
            AND a.question_id = q.question_id AND a.participant_id = quiz_participants.id
        )
    ), MAX(0, (SELECT COUNT(*) FROM quiz_session_questions q
               WHERE q.session_id = quiz_participants.session_id) - 1))
        WHERE token_hash IS NULL AND question_started_at IS NULL""")


def downgrade():
    raise RuntimeError("Secure quiz sessions cannot be downgraded without losing snapshots and credentials")
