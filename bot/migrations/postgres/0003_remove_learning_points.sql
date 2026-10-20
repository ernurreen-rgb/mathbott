-- Preserve the identity ledger and solved counters; remove only the retired XP feature.
SELECT pg_advisory_xact_lock(724831921);
ALTER TABLE user_task_rewards RENAME TO user_task_completions;
ALTER TABLE user_task_completions RENAME COLUMN reward_key TO completion_key;
ALTER TABLE user_task_completions RENAME COLUMN awarded_at TO completed_at;
ALTER TABLE user_task_completions DROP COLUMN points_awarded;
ALTER TABLE user_task_completions DROP COLUMN difficulty;
ALTER INDEX idx_user_task_rewards_user_id RENAME TO idx_user_task_completions_user_id;
ALTER TABLE users DROP COLUMN total_points;
DELETE FROM user_achievements WHERE achievement_id = 'thousand_points';
