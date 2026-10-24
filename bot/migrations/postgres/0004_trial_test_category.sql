SELECT pg_advisory_xact_lock(724831921);
ALTER TABLE trial_tests ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Жалпы' NOT NULL;
