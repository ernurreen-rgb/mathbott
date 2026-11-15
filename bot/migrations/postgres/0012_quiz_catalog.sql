-- Catalog facets for a library of a thousand quizzes: school grade and a free-form topic.
ALTER TABLE quizzes ADD COLUMN grade SMALLINT CHECK (grade BETWEEN 1 AND 11);
ALTER TABLE quizzes ADD COLUMN topic TEXT NOT NULL DEFAULT '';
-- Titles such as "4-сынып: ..." already name the grade.
UPDATE quizzes SET grade = substring(title from '^\s*(1[01]|[1-9])\s*-\s*сынып')::smallint
WHERE title ~ '^\s*(1[01]|[1-9])\s*-\s*сынып';
-- The catalog counts games per quiz; without this every count scans all sessions.
CREATE INDEX idx_quiz_sessions_quiz ON quiz_sessions (quiz_id);
