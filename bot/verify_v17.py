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

async def verify():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    tests = await db.trial_tests.get_trial_tests(folder_id=11)
    test = next((t for t in tests if t['title'] == '17-нұсқа: Гүлзар'), None)
    if not test:
        print('ERROR: Test not found!')
        return

    test_id = test['id']
    print(f"Test ID: {test_id}, Title: {test['title']}, Folder: {test['folder_id']}")

    slots = await db.trial_tests.get_trial_test_tasks(test_id)
    print(f"Total slots returned: {len(slots)}")
    assert len(slots) == 40, f"Expected 40 slots, got {len(slots)}"

    task_ids = [s['bank_task_id'] for s in slots]
    
    # Batch fetch all tasks in one query
    tasks = await db.bank_tasks.list_tasks(limit=100)
    # Or query by IDs using connection pool
    async with db.connection_pool.acquire() as conn:
        placeholders = ','.join([f"${i+1}" for i in range(len(task_ids))])
        rows = await conn.fetch(f"SELECT * FROM bank_tasks WHERE id IN ({placeholders})", *task_ids)
    
    task_map = {r['id']: r for r in rows}

    dollar_found = False
    context_missing = False

    for slot in sorted(slots, key=lambda s: int(s['sort_order'])):
        task_id = slot['bank_task_id']
        idx = int(slot['sort_order']) + 1
        task = task_map.get(task_id)
        if not task:
            print(f"ERROR: task {task_id} not found in task_map!")
            continue

        text = task['text']
        q_type = task['question_type']
        ans = task['answer']
        topics = task['topics']
        img = task['image_filename']
        opts = json.loads(task['options']) if isinstance(task.get('options'), str) else (task.get('options') or [])
        subqs = json.loads(task['subquestions']) if isinstance(task.get('subquestions'), str) else (task.get('subquestions') or [])

        if '$' in text:
            print(f"ERROR: $ in slot {idx} text!")
            dollar_found = True

        for opt in opts:
            if '$' in opt.get('text', ''):
                print(f"ERROR: $ in slot {idx} option {opt.get('label')}!")
                dollar_found = True

        for sub in subqs:
            if '$' in sub.get('text', ''):
                print(f"ERROR: $ in slot {idx} subquestion!")
                dollar_found = True

        if idx in range(26, 31):
            if 'Контекст' not in topics:
                print(f"ERROR: Context tag missing in slot {idx}!")
                context_missing = True

        print(f"Slot {idx:02d}: ID={task_id}, Type={q_type:6s}, Ans={ans:15s}, Img={str(img):25s}, Topics={len(topics)}")

    if not dollar_found and not context_missing and len(task_map) == 40:
        print("\n=======================================================")
        print("VERIFICATION PASSED COMPLETELY! All 40 slots are valid.")
        print("=======================================================")

if __name__ == '__main__':
    asyncio.run(verify())
