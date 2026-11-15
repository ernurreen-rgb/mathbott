import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))

load_dotenv(bot_dir / ".env.prod.test")
db_url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")

from database import Database

async def main():
    db = Database(db_url, use_pool=False, auto_migrate=False)
    await db.init()
    
    # 1. Check all folders
    async with db.trial_tests._connection() as conn:
        cursor = await conn.execute('SELECT id, name FROM trial_test_folders ORDER BY id')
        folders = await cursor.fetchall()
        print('=== TRIAL TEST FOLDERS ===')
        for f in folders:
            print(f"Folder {f[0]}: {f[1]}")

    # 2. Check all trial tests and their task counts
    async with db.trial_tests._connection() as conn:
        cursor = await conn.execute('''
            SELECT tt.id, tt.title, tt.folder_id, f.name as folder_title,
                   COUNT(CASE WHEN ttt.deleted_at IS NULL THEN ttt.id END) as active_tasks,
                   COUNT(CASE WHEN ttt.deleted_at IS NOT NULL THEN 1 END) as deleted_tasks
            FROM trial_tests tt
            LEFT JOIN trial_test_folders f ON f.id = tt.folder_id
            LEFT JOIN trial_test_tasks ttt ON ttt.trial_test_id = tt.id
            GROUP BY tt.id, tt.title, tt.folder_id, f.name
            ORDER BY tt.id
        ''')
        tests = await cursor.fetchall()
        print('\n=== TRIAL TESTS ===')
        for t in tests:
            print(f"Test {t[0]}: {t[1]} (folder: {t[2]} - {t[3]}) -> active: {t[4]}, deleted: {t[5]}")

    # 3. Check unused bank tasks
    async with db.bank_tasks._connection() as conn:
        cursor = await conn.execute('''
            SELECT bt.id, bt.text, bt.question_type, bt.created_at, bt.deleted_at
            FROM bank_tasks bt
            WHERE bt.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
              AND NOT EXISTS (SELECT 1 FROM trial_test_tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
            ORDER BY bt.id DESC
        ''')
        unused = await cursor.fetchall()
        print(f'\n=== UNUSED BANK TASKS (total: {len(unused)}) ===')
        for u in unused:
            text_preview = (u[1] or '')[:70].replace('\n', ' ')
            print(f"Task #{u[0]} ({u[2]}, created: {u[3]}): {text_preview}")

    # 4. Check if these unused tasks were EVER attached to trial_test_tasks (e.g. deleted_at IS NOT NULL)
    async with db.bank_tasks._connection() as conn:
        cursor = await conn.execute('''
            SELECT ttt.trial_test_id, tt.title, ttt.bank_task_id, ttt.deleted_at
            FROM trial_test_tasks ttt
            JOIN trial_tests tt ON tt.id = ttt.trial_test_id
            WHERE ttt.bank_task_id IN (
                SELECT bt.id FROM bank_tasks bt
                WHERE bt.deleted_at IS NULL
                  AND NOT EXISTS (SELECT 1 FROM tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM trial_test_tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
            )
        ''')
        links = await cursor.fetchall()
        print(f'\n=== WERE UNUSED TASKS IN TRIAL TESTS BEFORE? (total rows: {len(links)}) ===')
        for l in links:
            print(f"Trial test {l[0]} ({l[1]}): bank_task {l[2]}, deleted_at: {l[3]}")

if __name__ == '__main__':
    asyncio.run(main())
