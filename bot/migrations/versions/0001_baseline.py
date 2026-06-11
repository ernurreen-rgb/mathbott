"""baseline schema

Revision ID: 0001_baseline
Revises:
Create Date: 2026-06-13

Full snapshot of the legacy schema previously created by
migrations.schema.create_schema (CREATE TABLE IF NOT EXISTS + ALTER backfill).
Existing databases that were created by the legacy bootstrap are stamped with
this revision instead of re-running it (see migrations.runner).
"""
from alembic import op

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

_DDL = [
    """
CREATE TABLE users (
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
        , streak INTEGER NOT NULL DEFAULT 0, last_streak_date DATE, onboarding_completed BOOLEAN NOT NULL DEFAULT 0)
    """,
    """
CREATE TABLE weekly_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reset_date DATE NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
CREATE TABLE user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            achievement_id TEXT NOT NULL,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, achievement_id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """,
    """
CREATE TABLE user_onboarding (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            how_did_you_hear TEXT,
            math_level TEXT,
            nickname TEXT,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """,
    """
CREATE TABLE friend_requests (
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
    """,
    """
CREATE TABLE friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, friend_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """,
    """
CREATE TABLE blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blocker_id INTEGER NOT NULL,
            blocked_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(blocker_id, blocked_id),
            FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """,
    """
CREATE TABLE friend_invites (
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
    """,
    """
CREATE TABLE modules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
CREATE TABLE sections (
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
    """,
    """
CREATE TABLE lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_id INTEGER NOT NULL,
            lesson_number INTEGER,
            title TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
        )
    """,
    """
CREATE TABLE mini_lessons (
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
    """,
    """
CREATE TABLE tasks (
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
    """,
    """
CREATE TABLE solutions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            answer TEXT NOT NULL,
            is_correct BOOLEAN NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    """,
    """
CREATE TABLE user_task_rewards (
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
    """,
    """
CREATE TABLE user_progress (
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
    """,
    """
CREATE TABLE user_task_question_progress (
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
    """,
    """
CREATE TABLE user_progress_summary (
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
    """,
    """
CREATE TABLE bank_tasks (
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
    """,
    """
CREATE TABLE bank_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            name_norm TEXT NOT NULL UNIQUE
        )
    """,
    """
CREATE TABLE bank_task_topic_map (
            bank_task_id INTEGER NOT NULL,
            topic_id INTEGER NOT NULL,
            UNIQUE(bank_task_id, topic_id),
            FOREIGN KEY (bank_task_id) REFERENCES bank_tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (topic_id) REFERENCES bank_topics(id) ON DELETE CASCADE
        )
    """,
    """
CREATE TABLE bank_task_versions (
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
    """,
    """
CREATE TABLE admin_audit_logs (
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
    """,
    """
CREATE TABLE ops_health_samples (
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
    """,
    """
CREATE TABLE ops_incidents (
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
    """,
    """
CREATE TABLE trial_tests (
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
    """,
    """
CREATE TABLE trial_test_tasks (
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
    """,
    """
CREATE TABLE trial_test_results (
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
    """,
    """
CREATE TABLE trial_test_drafts (
            user_id INTEGER NOT NULL,
            trial_test_id INTEGER NOT NULL,
            answers TEXT NOT NULL DEFAULT '{}',
            current_task_index INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, trial_test_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (trial_test_id) REFERENCES trial_tests(id) ON DELETE CASCADE
        )
    """,
    """
CREATE TABLE trial_test_coop_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trial_test_id INTEGER NOT NULL,
            owner_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (trial_test_id) REFERENCES trial_tests(id) ON DELETE CASCADE,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """,
    """
CREATE TABLE trial_test_coop_participants (
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
    """,
    """
CREATE TABLE trial_test_coop_answers (
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
    """,
    """
CREATE TABLE trial_test_coop_results (
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
    """,
    """
CREATE TABLE trial_test_coop_invites (
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
    """,
    """
CREATE TABLE reports (
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
    """,
    """
CREATE TABLE trial_test_reports (
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
    """,
    """
CREATE INDEX idx_user_task_rewards_user_id
        ON user_task_rewards(user_id)
    """,
    """
CREATE INDEX idx_solutions_user_correct_task ON solutions(user_id, is_correct, task_id)
    """,
    """
CREATE INDEX idx_solutions_user_created_at ON solutions(user_id, created_at)
    """,
    """
CREATE INDEX idx_tasks_section_deleted_sort ON tasks(section_id, deleted_at, sort_order, id)
    """,
    """
CREATE INDEX idx_tasks_mini_deleted_sort ON tasks(mini_lesson_id, deleted_at, sort_order, id)
    """,
    """
CREATE INDEX idx_tasks_bank_deleted ON tasks(bank_task_id, deleted_at)
    """,
    """
CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at)
    """,
    """
CREATE INDEX idx_sections_module_sort ON sections(module_id, sort_order, id)
    """,
    """
CREATE INDEX idx_lessons_section_sort ON lessons(section_id, sort_order, id)
    """,
    """
CREATE INDEX idx_bank_tasks_deleted_updated ON bank_tasks(deleted_at, updated_at DESC)
    """,
    """
CREATE INDEX idx_bank_tasks_difficulty_deleted ON bank_tasks(difficulty, deleted_at)
    """,
    """
CREATE INDEX idx_bank_topics_name_norm ON bank_topics(name_norm)
    """,
    """
CREATE INDEX idx_bank_task_topic_map_topic_task ON bank_task_topic_map(topic_id, bank_task_id)
    """,
    """
CREATE UNIQUE INDEX idx_bank_task_versions_task_version ON bank_task_versions(bank_task_id, version_no)
    """,
    """
CREATE INDEX idx_bank_task_versions_task_created ON bank_task_versions(bank_task_id, created_at DESC)
    """,
    """
CREATE INDEX idx_bank_task_versions_event_created ON bank_task_versions(event_type, created_at DESC)
    """,
    """
CREATE INDEX idx_admin_audit_logs_domain_created ON admin_audit_logs(domain, created_at DESC)
    """,
    """
CREATE INDEX idx_admin_audit_logs_action_created ON admin_audit_logs(action, created_at DESC)
    """,
    """
CREATE INDEX idx_admin_audit_logs_entity_created ON admin_audit_logs(entity_type, entity_id, created_at DESC)
    """,
    """
CREATE INDEX idx_admin_audit_logs_actor_email_created ON admin_audit_logs(actor_email, created_at DESC)
    """,
    """
CREATE INDEX idx_ops_health_samples_collected_desc ON ops_health_samples(collected_at DESC)
    """,
    """
CREATE INDEX idx_ops_incidents_status_severity_last_seen ON ops_incidents(status, severity, last_seen_at DESC)
    """,
    """
CREATE INDEX idx_ops_incidents_kind_status_last_seen ON ops_incidents(kind, status, last_seen_at DESC)
    """,
    """
CREATE INDEX idx_ops_incidents_fingerprint_status ON ops_incidents(fingerprint, status)
    """,
    """
CREATE INDEX idx_trial_test_tasks_test_id_sort ON trial_test_tasks(trial_test_id, sort_order)
    """,
    """
CREATE INDEX idx_trial_test_tasks_test_deleted_sort ON trial_test_tasks(trial_test_id, deleted_at, sort_order, id)
    """,
    """
CREATE INDEX idx_trial_test_tasks_test_bank_deleted ON trial_test_tasks(trial_test_id, bank_task_id, deleted_at)
    """,
    """
CREATE UNIQUE INDEX uq_trial_test_tasks_slot_unique_active ON trial_test_tasks(trial_test_id, sort_order) WHERE deleted_at IS NULL
    """,
    """
CREATE INDEX idx_trial_test_results_user_test ON trial_test_results(user_id, trial_test_id)
    """,
    """
CREATE INDEX idx_trial_test_results_user_completed ON trial_test_results(user_id, completed_at DESC)
    """,
    """
CREATE INDEX idx_trial_test_results_user_test_completed ON trial_test_results(user_id, trial_test_id, completed_at DESC)
    """,
    """
CREATE INDEX idx_trial_test_results_completed_at ON trial_test_results(completed_at DESC)
    """,
    """
CREATE INDEX idx_trial_test_coop_sessions_test_status ON trial_test_coop_sessions(trial_test_id, status)
    """,
    """
CREATE INDEX idx_trial_test_coop_participants_session ON trial_test_coop_participants(session_id)
    """,
    """
CREATE INDEX idx_trial_test_coop_answers_session_task ON trial_test_coop_answers(session_id, task_id)
    """,
    """
CREATE INDEX idx_trial_test_coop_results_session ON trial_test_coop_results(session_id)
    """,
    """
CREATE INDEX idx_trial_test_coop_invites_receiver_status ON trial_test_coop_invites(receiver_id, status)
    """,
    """
CREATE INDEX idx_trial_test_coop_invites_session ON trial_test_coop_invites(session_id)
    """,
    """
CREATE INDEX idx_trial_test_coop_invites_session_receiver_status ON trial_test_coop_invites(session_id, receiver_id, status)
    """,
    """
CREATE INDEX idx_trial_tests_sort_created ON trial_tests(sort_order, created_at DESC)
    """,
    """
CREATE INDEX idx_user_progress_user_task ON user_progress(user_id, task_id)
    """,
    """
CREATE INDEX idx_users_email ON users(email)
    """,
    """
CREATE INDEX idx_users_league_group ON users(league, league_group)
    """,
    """
CREATE INDEX idx_users_total_points ON users(total_points DESC, total_solved DESC)
    """,
    """
CREATE INDEX idx_users_week_points ON users(week_points DESC, total_points DESC)
    """,
    """
CREATE INDEX idx_users_admin_role ON users(admin_role)
    """,
    """
CREATE INDEX idx_user_progress_user_status ON user_progress(user_id, status)
    """,
    """
CREATE INDEX idx_user_progress_task_status ON user_progress(task_id, status)
    """,
    """
CREATE INDEX idx_user_progress_summary_user ON user_progress_summary(user_id)
    """,
    """
CREATE INDEX idx_user_progress_summary_module ON user_progress_summary(user_id, module_id)
    """,
    """
CREATE INDEX idx_user_progress_summary_section ON user_progress_summary(user_id, section_id)
    """,
    """
CREATE INDEX idx_user_progress_summary_lesson ON user_progress_summary(user_id, lesson_id)
    """,
    """
CREATE INDEX idx_user_progress_summary_mini_lesson ON user_progress_summary(user_id, mini_lesson_id)
    """,
    """
CREATE INDEX idx_user_task_question_progress_user_task ON user_task_question_progress(user_id, task_id)
    """,
    """
CREATE INDEX idx_reports_status_created ON reports(status, created_at DESC)
    """,
    """
CREATE INDEX idx_reports_user_id ON reports(user_id)
    """,
    """
CREATE INDEX idx_reports_user_created ON reports(user_id, created_at DESC)
    """,
    """
CREATE INDEX idx_reports_task_id ON reports(task_id)
    """,
    """
CREATE INDEX idx_trial_test_reports_status_created ON trial_test_reports(status, created_at DESC)
    """,
    """
CREATE INDEX idx_trial_test_reports_user_id ON trial_test_reports(user_id)
    """,
    """
CREATE INDEX idx_trial_test_reports_user_created ON trial_test_reports(user_id, created_at DESC)
    """,
    """
CREATE INDEX idx_trial_test_reports_user_task ON trial_test_reports(user_id, trial_test_task_id)
    """,
    """
CREATE INDEX idx_trial_test_reports_task_id ON trial_test_reports(trial_test_task_id)
    """,
    """
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id)
    """,
    """
CREATE INDEX idx_friend_requests_receiver_status ON friend_requests(receiver_id, status)
    """,
    """
CREATE INDEX idx_friend_requests_sender_status ON friend_requests(sender_id, status)
    """,
    """
CREATE INDEX idx_friendships_user_id ON friendships(user_id)
    """,
    """
CREATE INDEX idx_blocks_blocker_id ON blocks(blocker_id)
    """,
    """
CREATE INDEX idx_blocks_blocked_id ON blocks(blocked_id)
    """,
    """
CREATE INDEX idx_friend_invites_inviter_status ON friend_invites(inviter_id, status)
    """,
    """
CREATE INDEX idx_friend_invites_token_status ON friend_invites(token, status)
    """,
    """
CREATE INDEX idx_sections_module_id ON sections(module_id)
    """,
    """
CREATE INDEX idx_lessons_section_id ON lessons(section_id)
    """,
    """
CREATE INDEX idx_mini_lessons_lesson_id ON mini_lessons(lesson_id, mini_index)
    """,
]


def upgrade() -> None:
    for statement in _DDL:
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Baseline migration cannot be downgraded")
