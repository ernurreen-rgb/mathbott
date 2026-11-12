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

async def find_jer_telimi():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    async with db.bank_tasks._connection() as conn:
        rows = await conn.execute("SELECT id, text, question_type, answer, options, subquestions, image_filename FROM bank_tasks WHERE text LIKE '%Жер%' OR text LIKE '%телім%' OR text LIKE '%3-нұсқа%'")
        for r in await rows.fetchall():
            print(r[0], r[2], r[3], r[6], r[1][:80])

if __name__ == '__main__':
    asyncio.run(find_jer_telimi())
