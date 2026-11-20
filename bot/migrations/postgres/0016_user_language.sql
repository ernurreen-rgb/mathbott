-- Student interface language chosen in the profile. NULL means never chosen: the web app shows Kazakh.
ALTER TABLE users ADD COLUMN language TEXT;
ALTER TABLE users ADD CONSTRAINT users_language_check CHECK (language IS NULL OR language IN ('kk', 'ru'));
