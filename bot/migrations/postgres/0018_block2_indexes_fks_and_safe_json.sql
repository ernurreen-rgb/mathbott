-- Block 2 (H-13, H-14, H-15, H-16): missing hot indexes, safe JSONB helper,
-- and ON DELETE actions on foreign keys referencing users(id).

-- H-13: Functional index for case-insensitive email lookups (WHERE LOWER(email) = ?).
CREATE INDEX IF NOT EXISTS idx_users_lower_email
    ON users (LOWER(email));

-- H-15: Index for mistake analytics lookups by task_id ordered by id.
CREATE INDEX IF NOT EXISTS idx_module_review_attempts_task_id
    ON module_review_attempts (task_id, id);

-- H-16: Index on user_task_completions(bank_task_id) for bank-task cleanup & lookups.
CREATE INDEX IF NOT EXISTS idx_user_task_completions_bank_task_id
    ON user_task_completions (bank_task_id);

-- H-16: Ensure deleting a user does not fail on missing ON DELETE clauses.
ALTER TABLE user_achievements
    DROP CONSTRAINT IF EXISTS fk_user_achievements_user_id,
    ADD CONSTRAINT fk_user_achievements_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE quiz_participants
    DROP CONSTRAINT IF EXISTS fk_quiz_participants_user_id,
    ADD CONSTRAINT fk_quiz_participants_user_id
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE quiz_sessions
    DROP CONSTRAINT IF EXISTS fk_quiz_sessions_host_id,
    ADD CONSTRAINT fk_quiz_sessions_host_id
        FOREIGN KEY (host_id) REFERENCES users (id)
        ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE quizzes
    DROP CONSTRAINT IF EXISTS fk_quizzes_created_by,
    ADD CONSTRAINT fk_quizzes_created_by
        FOREIGN KEY (created_by) REFERENCES users (id)
        ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE reports
    DROP CONSTRAINT IF EXISTS fk_reports_resolved_by,
    ADD CONSTRAINT fk_reports_resolved_by
        FOREIGN KEY (resolved_by) REFERENCES users (id)
        ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE trial_test_reports
    DROP CONSTRAINT IF EXISTS fk_trial_test_reports_resolved_by,
    ADD CONSTRAINT fk_trial_test_reports_resolved_by
        FOREIGN KEY (resolved_by) REFERENCES users (id)
        ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

-- H-14: Safe JSONB object parser so corrupted/truncated JSON starting with '{'
-- never crashes statistics or unrecognized-answer queries.
CREATE OR REPLACE FUNCTION mathbot_try_jsonb_object(value text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    parsed jsonb;
BEGIN
    IF value IS NULL OR left(btrim(value), 1) <> '{' THEN
        RETURN '{}'::jsonb;
    END IF;
    parsed := value::jsonb;
    IF jsonb_typeof(parsed) <> 'object' THEN
        RETURN '{}'::jsonb;
    END IF;
    RETURN parsed;
EXCEPTION WHEN invalid_text_representation OR data_exception THEN
    RETURN '{}'::jsonb;
END;
$$;
