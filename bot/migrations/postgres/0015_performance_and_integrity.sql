-- Performance indexes for hot analytics/presence/join queries and incident uniqueness fix.

CREATE INDEX IF NOT EXISTS idx_users_last_active ON users (last_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_solutions_created_at ON solutions (created_at);
CREATE INDEX IF NOT EXISTS idx_solutions_task_id ON solutions (task_id);
CREATE INDEX IF NOT EXISTS idx_module_review_attempts_created_at ON module_review_attempts (created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_created_at ON quiz_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_participants_user_id ON quiz_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_participant_id ON quiz_answers (participant_id);
CREATE INDEX IF NOT EXISTS idx_user_page_visits_visited_at ON user_page_visits (visited_at);
CREATE INDEX IF NOT EXISTS idx_trial_test_tasks_bank_task_id ON trial_test_tasks (bank_task_id);
CREATE INDEX IF NOT EXISTS idx_trial_test_drafts_updated_at ON trial_test_drafts (updated_at);

-- Allow multiple historical resolved incidents with the same fingerprint while enforcing
-- at most one open incident per fingerprint.
ALTER TABLE ops_incidents DROP CONSTRAINT IF EXISTS ops_incidents_fingerprint_status_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_incidents_open_fingerprint
    ON ops_incidents (fingerprint)
    WHERE status = 'open';
