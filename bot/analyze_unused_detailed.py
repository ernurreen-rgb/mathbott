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

    print("==================================================")
    print("CHECKING ALL TESTS IN FOLDER 11 ('ҰБТ есептері')")
    print("==================================================")
    
    async with db.trial_tests._connection() as conn:
        cursor = await conn.execute('''
            SELECT id, title, folder_id FROM trial_tests 
            WHERE folder_id = 11
            ORDER BY id
        ''')
        tests = await cursor.fetchall()

    total_tests = len(tests)
    print(f"Found {total_tests} tests in folder 11.\n")

    all_tests_ok = True
    for t in tests:
        test_id, title, folder_id = t[0], t[1], t[2]
        async with db.trial_tests._connection() as conn:
            cursor = await conn.execute('''
                SELECT ttt.id, ttt.sort_order, ttt.bank_task_id, bt.question_type, bt.text, ttt.deleted_at
                FROM trial_test_tasks ttt
                JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
                WHERE ttt.trial_test_id = ?
                ORDER BY ttt.sort_order ASC
            ''', (test_id,))
            tasks = await cursor.fetchall()
        
        active_tasks = [task for task in tasks if task[5] is None]
        sort_orders = [task[1] for task in active_tasks]
        expected_orders = list(range(40))
        
        is_seq = sort_orders == expected_orders
        has_40 = len(active_tasks) == 40
        
        # Check context tasks (slots 25-29, 0-indexed => 26-30 1-indexed)
        context_slots = active_tasks[25:30] if len(active_tasks) >= 30 else []
        
        status = "OK" if (is_seq and has_40) else "ERROR"
        if status != "OK":
            all_tests_ok = False
            print(f"❌ Test {test_id}: {title} | Count: {len(active_tasks)}/40 | Orders: {sort_orders[:5]}...{sort_orders[-5:]}")
        else:
            print(f"✅ Test {test_id}: {title} | 40/40 tasks (sort_order 0..39 perfect)")

    print(f"\nAll 23 tests fully intact: {all_tests_ok}\n")

    print("==================================================")
    print("ANALYSIS OF THE 47 'UNUSED' (Қолданылмайтын) BANK TASKS")
    print("==================================================")
    
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

    print(f"Total unused bank tasks: {len(unused)}\n")
    
    for u in unused:
        bt_id, text, qtype, created = u[0], u[1], u[2], u[3]
        text_clean = (text or '').strip()
        # Find if there is an identical or near-identical task in bank_tasks that IS in a test
        async with db.bank_tasks._connection() as conn:
            cursor = await conn.execute('''
                SELECT bt2.id, tt.id, tt.title, ttt.sort_order
                FROM bank_tasks bt2
                JOIN trial_test_tasks ttt ON ttt.bank_task_id = bt2.id AND ttt.deleted_at IS NULL
                JOIN trial_tests tt ON tt.id = ttt.trial_test_id
                WHERE bt2.id != ? AND bt2.deleted_at IS NULL
                  AND (
                    bt2.text = ? 
                    OR bt2.text LIKE ?
                  )
            ''', (bt_id, text_clean, '%' + text_clean[:30] + '%' if len(text_clean) >= 30 else text_clean))
            matches = await cursor.fetchall()
        
        match_str = ""
        if matches:
            match_str = f"-> DUPLICATE of active Task #{matches[0][0]} in Test {matches[0][1]} ('{matches[0][2]}', slot {matches[0][3] + 1})"
        else:
            match_str = "-> Old/standalone task (not matched in current tests)"
        
        print(f"Task #{bt_id} ({qtype}, created {created}) {match_str}")
        print(f"   Text: {text_clean[:60]}...")

if __name__ == '__main__':
    asyncio.run(main())
