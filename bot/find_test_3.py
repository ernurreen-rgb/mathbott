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

async def find_test_3():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    tests = await db.trial_tests.get_trial_tests()
    print("All trial tests:")
    for t in tests:
        print(f"ID={t['id']} | title={t['title']} | category={t.get('category')} | folder_id={t.get('folder_id')}")
        if 'Жер' in t['title'] or '3' in t['title']:
            tasks = await db.trial_tests.get_trial_test_tasks(t['id'])
            print(f"  Found {len(tasks)} tasks for test {t['id']}:")
            for task in tasks[30:40]:
                slot = task['sort_order'] + 1
                print(f"    Slot {slot} | type={task['question_type']} | ans={task['answer']} | opts={len(task.get('options') or [])} | subqs={len(task.get('subquestions') or [])}")

if __name__ == '__main__':
    asyncio.run(find_test_3())
