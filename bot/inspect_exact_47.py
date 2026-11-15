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
    
    async with db.bank_tasks._connection() as conn:
        cursor = await conn.execute('''
            SELECT bt.id, bt.text, bt.question_type, bt.created_at, bt.deleted_at
            FROM bank_tasks bt
            WHERE bt.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM bank_task_twins tw WHERE tw.twin_bank_task_id = bt.id)
              AND NOT EXISTS (SELECT 1 FROM tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
              AND NOT EXISTS (SELECT 1 FROM trial_test_tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
            ORDER BY bt.id DESC
        ''')
        unused = await cursor.fetchall()
        print(f'=== EXACT UNUSED BANK TASKS (total: {len(unused)}) ===')
        for u in unused:
            text_preview = (u[1] or '')[:80].replace('\n', ' ')
            print(f"Task #{u[0]} ({u[2]}, created: {u[3]}): {text_preview}")

if __name__ == '__main__':
    asyncio.run(main())
