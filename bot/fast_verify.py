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

    print("=== 1. VERIFYING ALL 23 TESTS IN FOLDER 11 ('ҰБТ есептері') ===", flush=True)
    async with db.trial_tests._connection() as conn:
        cursor = await conn.execute('''
            SELECT tt.id, tt.title,
                   COUNT(CASE WHEN ttt.deleted_at IS NULL THEN 1 END) as active_count,
                   COUNT(CASE WHEN ttt.deleted_at IS NOT NULL THEN 1 END) as deleted_count,
                   MIN(ttt.sort_order) as min_sort,
                   MAX(ttt.sort_order) as max_sort
            FROM trial_tests tt
            LEFT JOIN trial_test_tasks ttt ON ttt.trial_test_id = tt.id
            WHERE tt.folder_id = 11
            GROUP BY tt.id, tt.title
            ORDER BY tt.id
        ''')
        tests = await cursor.fetchall()
        for t in tests:
            print(f"Test {t[0]:2d}: {t[1]:35s} | active: {t[2]:2d}/40 | deleted: {t[3]} | slots: {t[4]}..{t[5]}", flush=True)

    print("\n=== 2. LISTING ALL 47 UNUSED BANK TASKS ===", flush=True)
    async with db.bank_tasks._connection() as conn:
        cursor = await conn.execute('''
            SELECT bt.id, bt.text, bt.question_type, bt.created_at
            FROM bank_tasks bt
            WHERE bt.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM bank_task_twins tw WHERE tw.twin_bank_task_id = bt.id)
              AND NOT EXISTS (SELECT 1 FROM tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
              AND NOT EXISTS (SELECT 1 FROM trial_test_tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
            ORDER BY bt.id ASC
        ''')
        unused = await cursor.fetchall()
        print(f"Total unused: {len(unused)}", flush=True)
        for u in unused:
            preview = (u[1] or '').strip().replace('\n', ' ')[:75]
            print(f"#{u[0]:<5d} | {u[2]:<6s} | {str(u[3])[:19]} | {preview}", flush=True)

    print("\n=== 3. CHECKING IF ANY TRIAL TEST HAS MISSING SLOTS (holes in sort_order) ===", flush=True)
    for t in tests:
        test_id = t[0]
        async with db.trial_tests._connection() as conn:
            cursor = await conn.execute('''
                SELECT sort_order, bank_task_id
                FROM trial_test_tasks
                WHERE trial_test_id = ? AND deleted_at IS NULL
                ORDER BY sort_order ASC
            ''', (test_id,))
            rows = await cursor.fetchall()
            slots = [r[0] for r in rows]
            if slots != list(range(40)):
                print(f"⚠️ Test {test_id} has irregular slots: {slots}", flush=True)

    print("\n=== 4. CHECKING TESTS OUTSIDE FOLDER 11 ===", flush=True)
    async with db.trial_tests._connection() as conn:
        cursor = await conn.execute('''
            SELECT tt.id, tt.title, tt.folder_id, f.name,
                   COUNT(CASE WHEN ttt.deleted_at IS NULL THEN 1 END) as active_count
            FROM trial_tests tt
            LEFT JOIN trial_test_folders f ON f.id = tt.folder_id
            LEFT JOIN trial_test_tasks ttt ON ttt.trial_test_id = tt.id
            WHERE tt.folder_id != 11 OR tt.folder_id IS NULL
            GROUP BY tt.id, tt.title, tt.folder_id, f.name
            ORDER BY tt.id
        ''')
        other_tests = await cursor.fetchall()
        for ot in other_tests:
            print(f"Test {ot[0]:2d}: {ot[1]:35s} (folder {ot[2]}: {ot[3]}) | active: {ot[4]}", flush=True)

    print("\nDONE!", flush=True)

if __name__ == '__main__':
    asyncio.run(main())
