ALTER TABLE bank_task_twins ADD COLUMN ai_model TEXT;
ALTER TABLE bank_task_twins ADD COLUMN ai_check_status TEXT CHECK(ai_check_status IN ('match', 'mismatch', 'error'));
ALTER TABLE bank_task_twins ADD COLUMN ai_check_answer TEXT;
ALTER TABLE bank_task_twins ADD COLUMN ai_checked_version BIGINT;
ALTER TABLE bank_task_twins ADD COLUMN ai_checked_at TEXT;
