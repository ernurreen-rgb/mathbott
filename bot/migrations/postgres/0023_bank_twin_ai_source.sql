-- Assign 'AI' source to all active tasks that have active twins, and to those active twins themselves.
INSERT INTO bank_sources (name, name_norm)
VALUES ('AI', 'ai')
ON CONFLICT (name_norm) DO NOTHING;

INSERT INTO bank_task_source_map (bank_task_id, source_id)
SELECT DISTINCT target_id, s.id
FROM (
    SELECT tw.source_bank_task_id AS target_id
    FROM bank_task_twins tw
    JOIN bank_tasks src ON src.id = tw.source_bank_task_id AND src.deleted_at IS NULL
    JOIN bank_tasks dst ON dst.id = tw.twin_bank_task_id AND dst.deleted_at IS NULL
    UNION
    SELECT tw.twin_bank_task_id AS target_id
    FROM bank_task_twins tw
    JOIN bank_tasks src ON src.id = tw.source_bank_task_id AND src.deleted_at IS NULL
    JOIN bank_tasks dst ON dst.id = tw.twin_bank_task_id AND dst.deleted_at IS NULL
) targets
JOIN bank_sources s ON s.name_norm = 'ai'
ON CONFLICT DO NOTHING;
