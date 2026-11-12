import asyncio
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

async def verify():
    db = Database(get_db_url(), use_pool=True, auto_migrate=False)
    await db.init()
    tests = await db.trial_tests.get_trial_tests(folder_id=11)
    t = next((x for x in tests if x['title'] == '9-нұсқа: Проектор'), None)
    if not t:
        print('Test not found!')
        return
    print(f"Test found: ID={t['id']}, Title={t['title']}, Expected={t.get('expected_tasks_count')}")
    tasks = await db.trial_tests.get_trial_test_tasks(t['id'])
    print(f"Actual tasks count: {len(tasks)}")
    for task in sorted(tasks, key=lambda x: int(x['sort_order'])):
        so = int(task['sort_order']) + 1
        bt_id = task['bank_task_id']
        bt = await db.bank_tasks.get_task_by_id(bt_id)
        q_type = bt['question_type']
        ans = bt['answer']
        img = bt.get('image_filename')
        top = bt.get('topics') or []
        has_context = 'Контекст' in top
        print(f"Slot {so:02d}: ID={bt_id}, Type={q_type:6s}, Ans={ans:10s}, Img={str(img):22s}, Topics={top}")

if __name__ == '__main__':
    asyncio.run(verify())
