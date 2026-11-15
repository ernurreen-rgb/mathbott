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

    # 1. Fetch exact unused tasks matching the admin/bank unused criteria
    async with db.bank_tasks._connection() as conn:
        cursor = await conn.execute('''
            SELECT bt.id, bt.text
            FROM bank_tasks bt
            WHERE bt.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM bank_task_twins tw WHERE tw.twin_bank_task_id = bt.id)
              AND NOT EXISTS (SELECT 1 FROM tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
              AND NOT EXISTS (SELECT 1 FROM trial_test_tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
            ORDER BY bt.id ASC
        ''')
        unused = await cursor.fetchall()

    task_ids = [u[0] for u in unused]
    print(f"Found {len(task_ids)} unused tasks to soft-delete: {task_ids}", flush=True)

    # 2. Soft-delete each task
    deleted_count = 0
    for task_id in task_ids:
        success = await db.bank_tasks.soft_delete_task(
            task_id,
            source="admin_cleanup",
            reason="Unused draft/legacy task cleaned up by user request"
        )
        if success:
            deleted_count += 1
            print(f"  Deleted task #{task_id}", flush=True)
        else:
            print(f"  Failed to delete task #{task_id}", flush=True)

    print(f"\nSuccessfully soft-deleted {deleted_count}/{len(task_ids)} tasks.", flush=True)

    # 3. Check catalog summary
    catalog = await db.bank_tasks.get_catalog()
    print("\nCatalog summary after cleanup:", catalog.get("summary", catalog), flush=True)

    # 4. Final safety check on folder 11
    async with db.trial_tests._connection() as conn:
        cursor = await conn.execute('''
            SELECT COUNT(*) FROM trial_tests WHERE folder_id = 11
        ''')
        test_count = (await cursor.fetchone())[0]
        
        cursor = await conn.execute('''
            SELECT COUNT(*) FROM trial_test_tasks ttt
            JOIN trial_tests tt ON tt.id = ttt.trial_test_id
            WHERE tt.folder_id = 11 AND ttt.deleted_at IS NULL
        ''')
        total_active_tasks = (await cursor.fetchone())[0]

    print(f"\nFolder 11 check: {test_count} tests, {total_active_tasks} active tasks (expected: {test_count * 40} = {test_count * 40}).", flush=True)
    if total_active_tasks == test_count * 40:
        print("✅ ALL TESTS REMAIN 100% INTACT!", flush=True)
    else:
        print("❌ WARNING: Task count mismatch!", flush=True)

if __name__ == '__main__':
    asyncio.run(main())
