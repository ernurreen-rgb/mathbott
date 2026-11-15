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
    
    # Check trial tests for Basketball (Variant 6) and others
    async with db.trial_tests._connection() as conn:
        cursor = await conn.execute('''
            SELECT tt.id, tt.title, COUNT(ttt.id) as task_count
            FROM trial_tests tt
            LEFT JOIN trial_test_tasks ttt ON ttt.trial_test_id = tt.id AND ttt.deleted_at IS NULL
            WHERE tt.folder_id = 11
            GROUP BY tt.id, tt.title
            ORDER BY tt.id
        ''')
        rows = await cursor.fetchall()
        for r in rows:
            print(f"Test {r[0]}: {r[1]} -> {r[2]} tasks")

    # Let's check which bank tasks are currently attached to Test 20 (6-нұсқа: Баскетбол алаңы)
    async with db.trial_tests._connection() as conn:
        cursor = await conn.execute('''
            SELECT ttt.sort_order, ttt.bank_task_id, bt.text
            FROM trial_test_tasks ttt
            JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
            WHERE ttt.trial_test_id = 20 AND ttt.deleted_at IS NULL
            ORDER BY ttt.sort_order
        ''')
        rows = await cursor.fetchall()
        print(f"\nTest 20 currently has {len(rows)} tasks:")
        for r in rows[:5]:
            print(f"  Slot {r[0]}: BankTask #{r[1]} - {(r[2] or '')[:50]}")
        for r in rows[25:31]:
            print(f"  Slot {r[0]}: BankTask #{r[1]} - {(r[2] or '')[:50]}")

    # Check why tasks 1387, 1393, etc. are not in Test 20
    async with db.trial_tests._connection() as conn:
        cursor = await conn.execute('''
            SELECT ttt.trial_test_id, ttt.sort_order, ttt.deleted_at, ttt.bank_task_id
            FROM trial_test_tasks ttt
            WHERE ttt.bank_task_id IN (1387, 1393, 1397, 1400, 1404, 1408, 1412, 1416, 1420)
        ''')
        rows = await cursor.fetchall()
        print(f"\nWere 1387... ever in trial_test_tasks? Rows: {len(rows)}")
        for r in rows:
            print(r)

if __name__ == '__main__':
    asyncio.run(main())
