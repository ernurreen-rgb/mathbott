import sqlite3

conn = sqlite3.connect('bot/mathbot.db')
c = conn.cursor()

print("Tasks in test 9 (Семей көпірі):")
rows = list(c.execute("SELECT t.id, t.text, t.question_type, t.options, t.answer, t.image_filename FROM trial_test_tasks tt JOIN bank_tasks t ON t.id = tt.bank_task_id WHERE tt.trial_test_id = 9"))
print(f"Total tasks: {len(rows)}")
for r in rows[:5]:
    print("---")
    print("Text:", r[1])
    print("Type:", r[2])
    print("Options:", r[3])
    print("Answer:", r[4])
    print("Image:", r[5])

conn.close()
