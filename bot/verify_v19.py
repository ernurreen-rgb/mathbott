import asyncio
from pathlib import Path
import sys

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))
from database import Database

async def verify():
    with open(bot_dir / '.env.prod.test', 'r') as f:
        for line in f:
            if line.startswith('DATABASE_URL='):
                db_url = line.split('=', 1)[1].strip().strip('"').strip("'")
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    # Get test info
    test = await db.trial_tests.get_trial_test(37)
    print('Test details:', test['id'], test['title'], test['description'], 'folder:', test['folder_id'])

    tasks = await db.trial_tests.get_trial_test_tasks(37)
    print('Tasks count in test:', len(tasks))
    assert len(tasks) == 40, f'Expected 40 tasks, got {len(tasks)}'

    for t in tasks:
        slot = int(t['sort_order']) + 1
        qtype = t['question_type']
        img = t.get('image_filename')
        topics = t.get('topics') or []
        assert '$' not in t['text'], f'Dollar found in text of slot {slot}'
        if 26 <= slot <= 30:
            assert 'Контекст' in topics, f'Missing Контекст tag in slot {slot}'
        print(f"Slot {slot:02d}: id={t['id']}, type={qtype}, img={img}, topics={topics[:3]}")

    print('ALL VERIFICATIONS PASSED SUCCESSFULLY!')

if __name__ == '__main__':
    asyncio.run(verify())
