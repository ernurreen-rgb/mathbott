import sqlite3

conn = sqlite3.connect('bot/mathbot.db')
c = conn.cursor()
tasks = c.execute("SELECT tt.sort_order, bt.id, bt.text, bt.question_type, bt.answer, bt.options, bt.subquestions, bt.image_filename FROM trial_test_tasks tt JOIN bank_tasks bt ON bt.id = tt.bank_task_id WHERE tt.trial_test_id = 9 ORDER BY tt.sort_order").fetchall()
print(f"Tasks in test 9: {len(tasks)}")
for t in tasks:
    print(f"Slot {t[0]+1:02d} | type={t[3]} | ans={t[4]} | img={t[7]} | text={t[2][:60]}")
    if t[0]+1 in [26, 31, 36]:
        print("   options:", t[5])
        print("   subquestions:", t[6])
