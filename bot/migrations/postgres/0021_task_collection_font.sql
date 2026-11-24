-- The font of a collection's PowerPoint deck (task constructor). The default is the font of the
-- Juz40 live-lesson decks, which most of the teachers who use the constructor have installed.
-- The API accepts only the names it offers (routes/constructor.py PPTX_FONTS).
ALTER TABLE task_collections ADD COLUMN pptx_font TEXT NOT NULL DEFAULT 'JUZ40 FONTS'
    CHECK (char_length(pptx_font) BETWEEN 1 AND 64);
