import asyncio
import sys
from pathlib import Path

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))

from database import Database
from check_existing_format import get_db_url

async def main():
    db = Database(get_db_url(), use_pool=True, auto_migrate=False)
    await db.init()
    async with db.bank_tasks._connection() as conn:
        r = await conn.execute("SELECT COUNT(*) FROM bank_tasks WHERE id < 1000 AND text LIKE '%$%'")
        c = (await r.fetchone())[0]
        print("Older bank_tasks with dollar:", c)
        
        r2 = await conn.execute("SELECT id, text, options FROM bank_tasks WHERE id < 1000 AND text LIKE '%$%' LIMIT 5")
        for row in await r2.fetchall():
            print(row)

if __name__ == '__main__':
    asyncio.run(main())
