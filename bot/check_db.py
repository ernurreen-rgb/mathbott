import sqlite3
conn = sqlite3.connect('mathbot.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='subtasks'")
result = cursor.fetchone()
print('Table subtasks exists:', result is not None)
if result:
    cursor.execute("PRAGMA table_info(subtasks)")
    columns = cursor.fetchall()
    print('Columns:', [col[1] for col in columns])
conn.close()
