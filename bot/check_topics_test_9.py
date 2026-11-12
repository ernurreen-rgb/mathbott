import sqlite3

conn = sqlite3.connect('bot/mathbot.db')
c = conn.cursor()

for row in c.execute("""
    SELECT t.id, t.text, group_concat(tp.name, ', ')
    FROM bank_tasks t
    LEFT JOIN bank_task_topic_map m ON m.bank_task_id = t.id
    LEFT JOIN bank_topics tp ON tp.id = m.topic_id
    WHERE t.id IN (SELECT bank_task_id FROM trial_test_tasks WHERE trial_test_id = 9)
    GROUP BY t.id
    LIMIT 5
"""):
    print("ID:", row[0], "Text:", row[1][:40], "Topics:", row[2])

conn.close()
