"""
Database schema creation and migrations
"""
import json
import logging
import os

logger = logging.getLogger(__name__)


def _is_bank_only_migration_requested() -> bool:
    run_value = (os.getenv("RUN_BANK_ONLY_MIGRATION", "") or "").strip().lower()
    if run_value not in {"1", "true", "yes", "y"}:
        return False

    confirm_value = (os.getenv("BANK_ONLY_MIGRATION_CONFIRM", "") or "").strip().upper()
    if confirm_value != "YES":
        raise RuntimeError(
            "Bank-only migration is destructive. Set BANK_ONLY_MIGRATION_CONFIRM=YES to continue."
        )
    return True


async def _run_bank_only_hard_reset(db) -> None:
    """Hard-reset task-related tables and remove template tables."""
    logger.warning("Running destructive bank-only migration hard reset")
    await db.execute("PRAGMA foreign_keys = OFF")

    # Drop indexes that reference template/legacy tables (safe if absent).
    for idx in [
        "idx_trial_test_template_tasks_template_id_sort",
        "idx_trial_test_templates_sort_created",
        "uq_trial_test_tasks_bank_unique_active",
        "uq_trial_test_tasks_slot_unique_active",
    ]:
        try:
            await db.execute(f"DROP INDEX IF EXISTS {idx}")
        except Exception:
            pass

    # Drop task-related data tables so schema can be recreated cleanly.
    for table in [
        "trial_test_template_tasks",
        "trial_test_templates",
        "trial_test_reports",
        "reports",
        "user_task_question_progress",
        "user_progress",
        "solutions",
        "trial_test_coop_answers",
        "trial_test_coop_results",
        "trial_test_drafts",
        "trial_test_results",
        "trial_test_tasks",
        "tasks",
    ]:
        try:
            await db.execute(f"DROP TABLE IF EXISTS {table}")
        except Exception:
            pass

    await db.execute("PRAGMA foreign_keys = ON")
    await db.commit()


async def _bootstrap_bank_task_versions(db) -> None:
    """
    Ensure all existing bank tasks have a version history baseline.
    Idempotent: only inserts version rows for tasks without any versions.
    """
    await db.execute("UPDATE bank_tasks SET current_version = COALESCE(current_version, 1)")

    old_row_factory = getattr(db, "row_factory", None)
    db.row_factory = None
    async with db.execute(
        """
        SELECT bt.id, bt.text, bt.answer, bt.question_type, bt.options, bt.subquestions,
               bt.image_filename, bt.solution_filename, bt.difficulty, bt.created_by
        FROM bank_tasks bt
        WHERE NOT EXISTS (
            SELECT 1 FROM bank_task_versions v WHERE v.bank_task_id = bt.id
        )
        """
    ) as cursor:
        rows = await cursor.fetchall()

    for row in rows:
        task_id = int(row[0])
        async with db.execute(
            """
            SELECT t.name
            FROM bank_task_topic_map m
            JOIN bank_topics t ON t.id = m.topic_id
            WHERE m.bank_task_id = ?
            ORDER BY t.name COLLATE NOCASE ASC
            """,
            (task_id,),
        ) as topics_cursor:
            topic_rows = await topics_cursor.fetchall()

        topics = [topic_row[0] for topic_row in topic_rows]
        options = None
        subquestions = None
        try:
            options = json.loads(row[4]) if row[4] else None
        except Exception:
            options = None
        try:
            subquestions = json.loads(row[5]) if row[5] else None
        except Exception:
            subquestions = None

        snapshot = {
            "text": row[1] or "",
            "answer": row[2] or "",
            "question_type": row[3] or "input",
            "options": options,
            "subquestions": subquestions,
            "difficulty": row[8] or "B",
            "topics": topics,
            "image_filename": row[6],
            "solution_filename": row[7],
        }

        await db.execute(
            """
            INSERT OR IGNORE INTO bank_task_versions
            (
                bank_task_id, version_no, event_type, source, actor_user_id,
                reason, rollback_from_version, changed_fields_json, snapshot_json
            )
            VALUES (?, 1, 'bootstrap', 'migration', ?, NULL, NULL, ?, ?)
            """,
            (
                task_id,
                row[9],
                json.dumps(["bootstrap"], ensure_ascii=False),
                json.dumps(snapshot, ensure_ascii=False),
            ),
        )

    await db.execute(
        """
        UPDATE bank_tasks
        SET current_version = COALESCE(
            (SELECT MAX(v.version_no) FROM bank_task_versions v WHERE v.bank_task_id = bank_tasks.id),
            1
        )
        """
    )
    db.row_factory = old_row_factory


async def create_schema(db):
    """Create all database tables and indexes"""
    if _is_bank_only_migration_requested():
        await _run_bank_only_hard_reset(db)

    # Users table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE,
            email TEXT UNIQUE,
            nickname TEXT,
            league TEXT NOT NULL DEFAULT 'Қола',
            league_group INTEGER NOT NULL DEFAULT 0,
            total_solved INTEGER NOT NULL DEFAULT 0,
            week_solved INTEGER NOT NULL DEFAULT 0,
            week_points INTEGER NOT NULL DEFAULT 0,
            total_points INTEGER NOT NULL DEFAULT 0,
            is_admin BOOLEAN NOT NULL DEFAULT 0,
            admin_role TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Add is_admin column if it doesn't exist (for existing databases)
    try:
        await db.execute("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0")
        await db.commit()
    except Exception:
        pass  # Column already exists
    
    # Add is_admin column if it doesn't exist (for existing databases)
    try:
        await db.execute("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0")
        await db.commit()
    except Exception:
        pass  # Column already exists
    
    # Add streak columns if they don't exist
    try:
        await db.execute("ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0")
        await db.commit()
    except Exception:
        pass  # Column already exists
    
    try:
        await db.execute("ALTER TABLE users ADD COLUMN last_streak_date DATE")
        await db.commit()
    except Exception:
        pass  # Column already exists
    
    # Add onboarding_completed column if it doesn't exist
    try:
        await db.execute("ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT 0")
        await db.commit()
    except Exception:
        pass  # Column already exists

    # Add admin_role column for RBAC (nullable for non-admin users)
    try:
        await db.execute("ALTER TABLE users ADD COLUMN admin_role TEXT")
        await db.commit()
    except Exception:
        pass  # Column already exists

    # Backfill existing admins with super_admin role
    try:
        await db.execute(
            """
            UPDATE users
            SET admin_role = 'super_admin'
            WHERE is_admin = 1
              AND (admin_role IS NULL OR TRIM(admin_role) = '')
            """
        )
        await db.commit()
    except Exception:
        pass

    # Weekly reset tracking
    await db.execute("""
        CREATE TABLE IF NOT EXISTS weekly_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reset_date DATE NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # User achievements table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            achievement_id TEXT NOT NULL,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, achievement_id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    
    # User onboarding table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_onboarding (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            how_did_you_hear TEXT,
            math_level TEXT,
            nickname TEXT,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # Friend requests (invitations between users)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            responded_at TIMESTAMP,
            UNIQUE(sender_id, receiver_id),
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Friendships (store both directions for quick lookup)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, friend_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Blocks (user-level blocking)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blocker_id INTEGER NOT NULL,
            blocked_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(blocker_id, blocked_id),
            FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Shareable friend invite links (one-time tokens)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS friend_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL UNIQUE,
            inviter_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            expires_at TIMESTAMP,
            accepted_by INTEGER,
            accepted_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    # Modules table (Модули)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS modules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Backfill columns for existing DBs (best-effort)
    for col_ddl in [
        "ALTER TABLE modules ADD COLUMN description TEXT",
        "ALTER TABLE modules ADD COLUMN icon TEXT",
        "ALTER TABLE modules ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE modules ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    ]:
        try:
            await db.execute(col_ddl)
            await db.commit()
        except Exception:
            pass

    # Sections table (Разделы внутри модуля)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            module_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            description TEXT,
            guide TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
        )
    """)
    
    # Backfill columns for existing DBs
    for col_ddl in [
        "ALTER TABLE sections ADD COLUMN description TEXT",
        "ALTER TABLE sections ADD COLUMN guide TEXT",
        "ALTER TABLE sections ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE sections ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    ]:
        try:
            await db.execute(col_ddl)
            await db.commit()
        except Exception:
            pass

    # Lessons table (Уроки внутри раздела)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_id INTEGER NOT NULL,
            lesson_number INTEGER,
            title TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
        )
    """)
    
    # Backfill columns
    for col_ddl in [
        "ALTER TABLE lessons ADD COLUMN lesson_number INTEGER",
        "ALTER TABLE lessons ADD COLUMN title TEXT",
        "ALTER TABLE lessons ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE lessons ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    ]:
        try:
            await db.execute(col_ddl)
            await db.commit()
        except Exception:
            pass

    # Mini-lessons table (4 мини-урока внутри урока)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS mini_lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_id INTEGER NOT NULL,
            mini_index INTEGER NOT NULL,
            title TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(lesson_id, mini_index),
            FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
        )
    """)

    # Tasks table (Задания)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_id INTEGER,
            mini_lesson_id INTEGER,
            bank_task_id INTEGER,
            task_type TEXT DEFAULT 'standard',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
            FOREIGN KEY (mini_lesson_id) REFERENCES mini_lessons(id) ON DELETE CASCADE,
            FOREIGN KEY (bank_task_id) REFERENCES bank_tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    
    # Migrate/ensure new columns exist for older DBs (best-effort)
    for col_ddl in [
        "ALTER TABLE tasks ADD COLUMN section_id INTEGER",
        "ALTER TABLE tasks ADD COLUMN mini_lesson_id INTEGER",
        "ALTER TABLE tasks ADD COLUMN bank_task_id INTEGER",
        "ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'standard'",
        "ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN created_by INTEGER",
        "ALTER TABLE tasks ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        "ALTER TABLE tasks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        "ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMP",
    ]:
        try:
            await db.execute(col_ddl)
            await db.commit()
        except Exception:
            pass

    # Solutions table (история ответов пользователей)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS solutions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            answer TEXT NOT NULL,
            is_correct BOOLEAN NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    """)

    # Backfill created_at for solutions (for existing DBs)
    try:
        await db.execute("ALTER TABLE solutions ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        await db.commit()
    except Exception:
        pass

    # Reward ledger for first-time task point awards
    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_task_rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            reward_key TEXT NOT NULL,
            bank_task_id INTEGER,
            difficulty TEXT NOT NULL,
            points_awarded INTEGER NOT NULL,
            source TEXT NOT NULL,
            source_ref_id INTEGER,
            awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, reward_key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (bank_task_id) REFERENCES bank_tasks(id) ON DELETE SET NULL
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_task_rewards_user_id
        ON user_task_rewards(user_id)
    """)

    # User progress for tasks (used by modules map)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'not_started',
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, task_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    """)

    # Per-question progress for legacy multi-question tasks
    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_task_question_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            question_index INTEGER NOT NULL,
            is_correct BOOLEAN NOT NULL DEFAULT 0,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, task_id, question_index),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    """)
    
    # User progress summary (materialized view for fast access)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_progress_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            module_id INTEGER,
            section_id INTEGER,
            lesson_id INTEGER,
            mini_lesson_id INTEGER,
            total_tasks INTEGER NOT NULL DEFAULT 0,
            completed_tasks INTEGER NOT NULL DEFAULT 0,
            progress REAL NOT NULL DEFAULT 0.0,
            is_completed BOOLEAN NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, module_id, section_id, lesson_id, mini_lesson_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
            FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
            FOREIGN KEY (mini_lesson_id) REFERENCES mini_lessons(id) ON DELETE CASCADE
        )
    """)

    # Admin AI solutions - REMOVED
    # Table creation removed as AI solutions feature was deleted

    # Bank tasks pool (for assembling trial tests)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS bank_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL DEFAULT '',
            answer TEXT NOT NULL DEFAULT '',
            question_type TEXT NOT NULL DEFAULT 'input',
            text_scale TEXT NOT NULL DEFAULT 'md',
            options TEXT,
            subquestions TEXT,
            image_filename TEXT,
            solution_filename TEXT,
            difficulty TEXT NOT NULL DEFAULT 'B' CHECK (difficulty IN ('A','B','C')),
            current_version INTEGER NOT NULL DEFAULT 1,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS bank_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            name_norm TEXT NOT NULL UNIQUE
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS bank_task_topic_map (
            bank_task_id INTEGER NOT NULL,
            topic_id INTEGER NOT NULL,
            UNIQUE(bank_task_id, topic_id),
            FOREIGN KEY (bank_task_id) REFERENCES bank_tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (topic_id) REFERENCES bank_topics(id) ON DELETE CASCADE
        )
    """)

    # Best-effort add columns for bank_tasks (for existing DBs)
    for col_ddl in [
        "ALTER TABLE bank_tasks ADD COLUMN options TEXT",
        "ALTER TABLE bank_tasks ADD COLUMN subquestions TEXT",
        "ALTER TABLE bank_tasks ADD COLUMN question_type TEXT NOT NULL DEFAULT 'input'",
        "ALTER TABLE bank_tasks ADD COLUMN text_scale TEXT NOT NULL DEFAULT 'md'",
        "ALTER TABLE bank_tasks ADD COLUMN image_filename TEXT",
        "ALTER TABLE bank_tasks ADD COLUMN solution_filename TEXT",
        "ALTER TABLE bank_tasks ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'B'",
        "ALTER TABLE bank_tasks ADD COLUMN created_by INTEGER",
        "ALTER TABLE bank_tasks ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        "ALTER TABLE bank_tasks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        "ALTER TABLE bank_tasks ADD COLUMN deleted_at TIMESTAMP",
        "ALTER TABLE bank_tasks ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1",
    ]:
        try:
            await db.execute(col_ddl)
            await db.commit()
        except Exception:
            pass

    await db.execute("""
        CREATE TABLE IF NOT EXISTS bank_task_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_task_id INTEGER NOT NULL,
            version_no INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            source TEXT,
            actor_user_id INTEGER,
            reason TEXT,
            rollback_from_version INTEGER,
            changed_fields_json TEXT,
            snapshot_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(bank_task_id, version_no),
            FOREIGN KEY (bank_task_id) REFERENCES bank_tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            actor_user_id INTEGER,
            actor_email TEXT NOT NULL,
            summary TEXT NOT NULL,
            changed_fields_json TEXT NOT NULL DEFAULT '[]',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS ops_health_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            service_status TEXT NOT NULL,
            database_status TEXT NOT NULL,
            requests_5m INTEGER NOT NULL,
            errors_5m INTEGER NOT NULL,
            error_rate_5m REAL NOT NULL,
            p95_ms_5m REAL NOT NULL,
            avg_ms_5m REAL NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS ops_incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            severity TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            occurrences INTEGER NOT NULL DEFAULT 1,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            telegram_last_sent_at TIMESTAMP NULL,
            resolved_at TIMESTAMP NULL,
            UNIQUE(fingerprint, status)
        )
    """)

    await _bootstrap_bank_task_versions(db)

    # Trial tests table (Пробные тестирования)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            expected_tasks_count INTEGER NOT NULL DEFAULT 40,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    # Add sort_order column to trial_tests if it doesn't exist
    try:
        await db.execute("ALTER TABLE trial_tests ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        await db.commit()
    except Exception:
        pass  # Column already exists

    try:
        await db.execute("ALTER TABLE trial_tests ADD COLUMN expected_tasks_count INTEGER NOT NULL DEFAULT 40")
        await db.commit()
    except Exception:
        pass

    # Trial test tasks table (отдельная таблица для задач пробных тестов)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_test_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trial_test_id INTEGER NOT NULL,
            bank_task_id INTEGER,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMP,
            FOREIGN KEY (trial_test_id) REFERENCES trial_tests(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (bank_task_id) REFERENCES bank_tasks(id) ON DELETE CASCADE
        )
    """)

    # Best-effort add columns for trial_test_tasks (for existing DBs)
    for col_ddl in [
        "ALTER TABLE trial_test_tasks ADD COLUMN deleted_at TIMESTAMP",
        "ALTER TABLE trial_test_tasks ADD COLUMN created_by INTEGER",
        "ALTER TABLE trial_test_tasks ADD COLUMN bank_task_id INTEGER",
        "ALTER TABLE trial_test_tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE trial_test_tasks ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        "ALTER TABLE trial_test_tasks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    ]:
        try:
            await db.execute(col_ddl)
            await db.commit()
        except Exception:
            pass

    # Trial test results (результаты прохождения тестов)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_test_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            trial_test_id INTEGER NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0,
            percentage REAL NOT NULL DEFAULT 0.0,
            answers TEXT NOT NULL,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (trial_test_id) REFERENCES trial_tests(id) ON DELETE CASCADE
        )
    """)

    # Trial test drafts (черновики ответов — восстанавливаются при обновлении страницы)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_test_drafts (
            user_id INTEGER NOT NULL,
            trial_test_id INTEGER NOT NULL,
            answers TEXT NOT NULL DEFAULT '{}',
            current_task_index INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, trial_test_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (trial_test_id) REFERENCES trial_tests(id) ON DELETE CASCADE
        )
    """)

    # Trial test coop sessions (совместное прохождение)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_test_coop_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trial_test_id INTEGER NOT NULL,
            owner_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (trial_test_id) REFERENCES trial_tests(id) ON DELETE CASCADE,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_test_coop_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            color TEXT NOT NULL,
            is_finished BOOLEAN NOT NULL DEFAULT 0,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, user_id),
            FOREIGN KEY (session_id) REFERENCES trial_test_coop_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_test_coop_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            answer TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, user_id, task_id),
            FOREIGN KEY (session_id) REFERENCES trial_test_coop_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_test_coop_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            trial_test_result_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, user_id),
            FOREIGN KEY (session_id) REFERENCES trial_test_coop_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (trial_test_result_id) REFERENCES trial_test_results(id) ON DELETE CASCADE
        )
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_test_coop_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            responded_at TIMESTAMP,
            UNIQUE(session_id, receiver_id),
            FOREIGN KEY (session_id) REFERENCES trial_test_coop_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Trial test templates removed in bank-only flow.

    # Reports table - for user reports about tasks
    await db.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP,
            resolved_by INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (resolved_by) REFERENCES users(id)
        )
    """)

    # Trial test reports table - for user reports about trial test tasks
    await db.execute("""
        CREATE TABLE IF NOT EXISTS trial_test_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            trial_test_id INTEGER NOT NULL,
            trial_test_task_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP,
            resolved_by INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (trial_test_id) REFERENCES trial_tests(id) ON DELETE CASCADE,
            FOREIGN KEY (trial_test_task_id) REFERENCES trial_test_tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (resolved_by) REFERENCES users(id)
        )
    """)

    # Backfill columns for trial_test_results (for existing DBs)
    try:
        await db.execute("ALTER TABLE trial_test_results ADD COLUMN percentage REAL NOT NULL DEFAULT 0.0")
        await db.commit()
    except Exception:
        pass
        
    try:
        await db.execute("ALTER TABLE trial_test_results ADD COLUMN answers TEXT NOT NULL DEFAULT '{}'")
        await db.commit()
    except Exception:
        pass

    try:
        await db.execute("ALTER TABLE trial_test_results ADD COLUMN score INTEGER NOT NULL DEFAULT 0")
        await db.commit()
    except Exception:
        pass

    try:
        await db.execute("ALTER TABLE trial_test_results ADD COLUMN total INTEGER NOT NULL DEFAULT 0")
        await db.commit()
    except Exception:
        pass

    # Create indexes
    await create_indexes(db)
    
    await db.commit()


async def create_indexes(db):
    """Create database indexes for performance"""
    indexes = [
        # solutions: used for solved tasks history and stats
        "CREATE INDEX IF NOT EXISTS idx_solutions_user_correct_task ON solutions(user_id, is_correct, task_id)",
        "CREATE INDEX IF NOT EXISTS idx_solutions_user_created_at ON solutions(user_id, created_at)",

        # tasks: most reads filter by section/mini_lesson and exclude deleted tasks + order by sort_order
        "CREATE INDEX IF NOT EXISTS idx_tasks_section_deleted_sort ON tasks(section_id, deleted_at, sort_order, id)",
        "CREATE INDEX IF NOT EXISTS idx_tasks_mini_deleted_sort ON tasks(mini_lesson_id, deleted_at, sort_order, id)",
        "CREATE INDEX IF NOT EXISTS idx_tasks_bank_deleted ON tasks(bank_task_id, deleted_at)",
        "CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at)",

        # hierarchy lookups + ordering
        "CREATE INDEX IF NOT EXISTS idx_sections_module_sort ON sections(module_id, sort_order, id)",
        "CREATE INDEX IF NOT EXISTS idx_lessons_section_sort ON lessons(section_id, sort_order, id)",

        # bank tasks indexes
        "CREATE INDEX IF NOT EXISTS idx_bank_tasks_deleted_updated ON bank_tasks(deleted_at, updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_bank_tasks_difficulty_deleted ON bank_tasks(difficulty, deleted_at)",
        "CREATE INDEX IF NOT EXISTS idx_bank_topics_name_norm ON bank_topics(name_norm)",
        "CREATE INDEX IF NOT EXISTS idx_bank_task_topic_map_topic_task ON bank_task_topic_map(topic_id, bank_task_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_task_versions_task_version ON bank_task_versions(bank_task_id, version_no)",
        "CREATE INDEX IF NOT EXISTS idx_bank_task_versions_task_created ON bank_task_versions(bank_task_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_bank_task_versions_event_created ON bank_task_versions(event_type, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_domain_created ON admin_audit_logs(domain, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_created ON admin_audit_logs(action, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity_created ON admin_audit_logs(entity_type, entity_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_email_created ON admin_audit_logs(actor_email, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_ops_health_samples_collected_desc ON ops_health_samples(collected_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_ops_incidents_status_severity_last_seen ON ops_incidents(status, severity, last_seen_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_ops_incidents_kind_status_last_seen ON ops_incidents(kind, status, last_seen_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_ops_incidents_fingerprint_status ON ops_incidents(fingerprint, status)",

        # trial tests indexes
        "CREATE INDEX IF NOT EXISTS idx_trial_test_tasks_test_id_sort ON trial_test_tasks(trial_test_id, sort_order)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_tasks_test_deleted_sort ON trial_test_tasks(trial_test_id, deleted_at, sort_order, id)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_tasks_test_bank_deleted ON trial_test_tasks(trial_test_id, bank_task_id, deleted_at)",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_trial_test_tasks_slot_unique_active ON trial_test_tasks(trial_test_id, sort_order) WHERE deleted_at IS NULL",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_results_user_test ON trial_test_results(user_id, trial_test_id)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_results_user_completed ON trial_test_results(user_id, completed_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_results_user_test_completed ON trial_test_results(user_id, trial_test_id, completed_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_results_completed_at ON trial_test_results(completed_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_coop_sessions_test_status ON trial_test_coop_sessions(trial_test_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_coop_participants_session ON trial_test_coop_participants(session_id)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_coop_answers_session_task ON trial_test_coop_answers(session_id, task_id)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_coop_results_session ON trial_test_coop_results(session_id)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_coop_invites_receiver_status ON trial_test_coop_invites(receiver_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_coop_invites_session ON trial_test_coop_invites(session_id)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_coop_invites_session_receiver_status ON trial_test_coop_invites(session_id, receiver_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_trial_tests_sort_created ON trial_tests(sort_order, created_at DESC)",
        
        # user progress indexes
        "CREATE INDEX IF NOT EXISTS idx_user_progress_user_task ON user_progress(user_id, task_id)",
        
        # users indexes
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
        "CREATE INDEX IF NOT EXISTS idx_users_league_group ON users(league, league_group)",
        "CREATE INDEX IF NOT EXISTS idx_users_total_points ON users(total_points DESC, total_solved DESC)",
        "CREATE INDEX IF NOT EXISTS idx_users_week_points ON users(week_points DESC, total_points DESC)",
        "CREATE INDEX IF NOT EXISTS idx_users_admin_role ON users(admin_role)",
        
        # user_progress indexes (composite for common queries)
        "CREATE INDEX IF NOT EXISTS idx_user_progress_user_status ON user_progress(user_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_user_progress_task_status ON user_progress(task_id, status)",
        
        # user_progress_summary indexes
        "CREATE INDEX IF NOT EXISTS idx_user_progress_summary_user ON user_progress_summary(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_progress_summary_module ON user_progress_summary(user_id, module_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_progress_summary_section ON user_progress_summary(user_id, section_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_progress_summary_lesson ON user_progress_summary(user_id, lesson_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_progress_summary_mini_lesson ON user_progress_summary(user_id, mini_lesson_id)",
        
        # user_task_question_progress indexes
        "CREATE INDEX IF NOT EXISTS idx_user_task_question_progress_user_task ON user_task_question_progress(user_id, task_id)",
        
        # reports indexes
        "CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_reports_user_created ON reports(user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_reports_task_id ON reports(task_id)",
        
        # trial_test_reports indexes
        "CREATE INDEX IF NOT EXISTS idx_trial_test_reports_status_created ON trial_test_reports(status, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_reports_user_id ON trial_test_reports(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_reports_user_created ON trial_test_reports(user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_reports_user_task ON trial_test_reports(user_id, trial_test_task_id)",
        "CREATE INDEX IF NOT EXISTS idx_trial_test_reports_task_id ON trial_test_reports(trial_test_task_id)",
        
        # user_achievements indexes
        "CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id)",

        # friend requests indexes
        "CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_status ON friend_requests(receiver_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_status ON friend_requests(sender_id, status)",

        # friendships indexes
        "CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id)",

        # blocks indexes
        "CREATE INDEX IF NOT EXISTS idx_blocks_blocker_id ON blocks(blocker_id)",
        "CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON blocks(blocked_id)",

        # friend invites indexes
        "CREATE INDEX IF NOT EXISTS idx_friend_invites_inviter_status ON friend_invites(inviter_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_friend_invites_token_status ON friend_invites(token, status)",
        
        # sections indexes (for module queries)
        "CREATE INDEX IF NOT EXISTS idx_sections_module_id ON sections(module_id)",
        
        # lessons indexes
        "CREATE INDEX IF NOT EXISTS idx_lessons_section_id ON lessons(section_id)",
        
        # mini_lessons indexes
        "CREATE INDEX IF NOT EXISTS idx_mini_lessons_lesson_id ON mini_lessons(lesson_id, mini_index)",
    ]
    
    for idx_ddl in indexes:
        try:
            await db.execute(idx_ddl)
        except Exception:
            # Best-effort: don't break startup if index creation fails
            pass

