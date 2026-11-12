import asyncio
import os
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

async def test():
    db_url = get_db_url()
    db = Database(db_url, use_pool=False, auto_migrate=False)
    await db.init()
    folders = await db.trial_tests.get_trial_test_folders(include_empty=True)
    print(f"Got {len(folders)} folders via Database class:")
    for f in folders:
        print(f)
    await db.close()

asyncio.run(test())
