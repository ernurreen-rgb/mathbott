import sqlite3

conn = sqlite3.connect('bot/mathbot.db')
c = conn.cursor()
tests = c.execute("SELECT id, title, folder_id, category FROM trial_tests").fetchall()
print("Local tests in mathbot.db:")
for t in tests:
    print(t)

jer_tasks = c.execute("SELECT id, text, question_type, answer, options, subquestions FROM bank_tasks WHERE text LIKE '%Жер%' OR text LIKE '%телім%'").fetchall()
print(f"\nLocal jer tasks count: {len(jer_tasks)}")
for j in jer_tasks:
    print(j[0], j[2], j[3], j[1][:80])
