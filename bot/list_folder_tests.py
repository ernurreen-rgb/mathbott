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
    tests = await db.trial_tests.get_trial_tests(folder_id=11)
    print(f"\nFound {len(tests)} tests in folder 11 ('ҰБТ есептері'):")
    for t in sorted(tests, key=lambda x: x['id']):
        tasks = await db.trial_tests.get_trial_test_tasks(t['id'])
        print(f"  Test ID {t['id']:2d}: {t['title']} | tasks count: {len(tasks)}/40")

if __name__ == '__main__':
    asyncio.run(main())
