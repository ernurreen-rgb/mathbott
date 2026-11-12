import sqlite3

conn = sqlite3.connect('bot/mathbot.db')
c = conn.cursor()

print("Trial tests in local db:")
for row in c.execute("SELECT * FROM trial_tests"):
    print(row)

print("\nTasks in trial test 13:")
for row in c.execute("SELECT t.*, tt.sort_order FROM trial_test_tasks tt JOIN bank_tasks t ON t.id = tt.bank_task_id WHERE tt.trial_test_id = 13 LIMIT 5"):
    print(row)

conn.close()
