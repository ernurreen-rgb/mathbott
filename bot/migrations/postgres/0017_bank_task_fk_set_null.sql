-- Prevent hard-deleting trashed bank tasks from cascading into tasks, trial_test_tasks,
-- solutions, user_progress, module_review_attempts, reports, and trial_test_reports.
ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS fk_tasks_bank_task_id,
    ADD CONSTRAINT fk_tasks_bank_task_id
        FOREIGN KEY (bank_task_id) REFERENCES bank_tasks (id)
        ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE trial_test_tasks
    DROP CONSTRAINT IF EXISTS fk_trial_test_tasks_bank_task_id,
    ADD CONSTRAINT fk_trial_test_tasks_bank_task_id
        FOREIGN KEY (bank_task_id) REFERENCES bank_tasks (id)
        ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;
