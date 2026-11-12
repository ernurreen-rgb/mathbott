import asyncio
import json
import sys
from pathlib import Path

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))

from database import Database

def get_db_url():
    with open(bot_dir / '.env.prod.test', 'r') as f:
        for line in f:
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

async def check_existing_tests():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    # Find existing tests with select or multi-choice tasks
    async with db.bank_tasks._connection() as conn:
        rows = await conn.execute("SELECT id, text, question_type, answer, options, subquestions FROM bank_tasks WHERE id < 1195 AND question_type = 'select' LIMIT 5")
        print("OLD select tasks in bank_tasks:")
        for r in await rows.fetchall():
            print(r)

        rows2 = await conn.execute("SELECT id, text, question_type, answer, options FROM bank_tasks WHERE id < 1195 AND question_type IN ('mcq', 'mcq6') AND (answer LIKE '%,%' OR answer LIKE '%[%') LIMIT 5")
        print("\nOLD multi-choice tasks in bank_tasks:")
        for r in await rows2.fetchall():
            print(r)

if __name__ == '__main__':
    asyncio.run(check_existing_tests())
