import sqlite3

conn = sqlite3.connect('mathbot.db')
c = conn.cursor()

print("--- Trial Test Folders ---")
try:
    for row in c.execute("SELECT * FROM trial_test_folders"):
        print(row)
except Exception as e:
    print("trial_test_folders err:", e)

print("\n--- Trial Tests ---")
try:
    for row in c.execute("SELECT id, title, category, folder_id, sort_order FROM trial_tests"):
        print(row)
except Exception as e:
    print("trial_tests err:", e)

print("\n--- Tasks with Жер телімі ---")
try:
    for row in c.execute("SELECT id, title, topic FROM tasks WHERE title LIKE '%Жер%' OR description LIKE '%Жер%' LIMIT 5"):
        print(row)
except Exception as e:
    print("tasks err:", e)

conn.close()
