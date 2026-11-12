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

async def main():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    tests = await db.trial_tests.get_trial_tests(folder_id=11)
    print("Tests in folder 11:", flush=True)
    for t in tests:
        print(f"ID={t['id']}, title={t['title']}, task_count={t.get('task_count')}", flush=True)
        tasks = await db.trial_tests.get_trial_test_tasks(t['id'])
        print(f"  Tasks loaded: {len(tasks)}", flush=True)

if __name__ == '__main__':
    asyncio.run(main())
