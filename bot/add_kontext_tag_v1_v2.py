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

async def main():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    # Find Test 1 and Test 2
    for title in ["1-нұсқа: Жылыжайдағы су", "2-нұсқа: Икосаэдр"]:
        tests = await db.trial_tests.get_trial_tests(folder_id=11)
        test = next((t for t in tests if t['title'] == title), None)
        if not test:
            print(f"Test '{title}' not found!")
            continue

        test_id = test['id']
        tasks = await db.trial_tests.get_trial_test_tasks(test_id)
        print(f"\nProcessing {title} (ID {test_id}), total tasks: {len(tasks)}")

        for t in tasks:
            slot_idx = int(t['sort_order']) + 1
            if 26 <= slot_idx <= 30:
                bank_task_id = t['bank_task_id']
                bt = await db.bank_tasks.get_task_by_id(bank_task_id)
                current_topics = list(bt.get('topics') or [])
                if "Контекст" not in current_topics:
                    if "ҰБТ есебі" in current_topics:
                        idx = current_topics.index("ҰБТ есебі") + 1
                        current_topics.insert(idx, "Контекст")
                    else:
                        current_topics.append("Контекст")
                    
                    await db.bank_tasks.update_task(bank_task_id, topics=current_topics)
                    print(f"  Slot {slot_idx} (bank_task_id {bank_task_id}): Added 'Контекст' -> {current_topics}")
                else:
                    print(f"  Slot {slot_idx} (bank_task_id {bank_task_id}): Already has 'Контекст' -> {current_topics}")

    print("\nDone adding 'Контекст' tag to variants 1 and 2!")

if __name__ == '__main__':
    asyncio.run(main())
