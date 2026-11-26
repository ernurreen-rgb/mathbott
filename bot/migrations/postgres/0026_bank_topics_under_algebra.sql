-- Nest the 14 algebra curriculum sections under the top-level 'Алгебра' root
-- so the topic tree has clean top-level branches ('Алгебра' auto-expanded in UI,
-- 'Геометрия' collapsible) while keeping every section one click away.

WITH algebra_sections(section_norm) AS (
    VALUES
        ('арифметика'),
        ('бөлшектер'),
        ('дәреже'),
        ('арифметикалық түбір'),
        ('қысқаша көбейту формулалары'),
        ('теңдеулер'),
        ('теңсіздіктер'),
        ('модуль'),
        ('функция'),
        ('прогрессия'),
        ('логарифм'),
        ('тригонометрия'),
        ('туынды'),
        ('интеграл')
)
UPDATE bank_topics AS child
SET parent_id = parent.id
FROM algebra_sections AS s
JOIN bank_topics AS parent ON parent.name_norm = 'алгебра'
WHERE child.name_norm = s.section_norm
  AND child.parent_id IS NULL
  AND child.id <> parent.id;
