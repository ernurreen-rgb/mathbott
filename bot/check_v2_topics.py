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
    db = Database(get_db_url(), use_pool=False, auto_migrate=False)
    await db.init()

    tests = await db.trial_tests.get_trial_tests(folder_id=11)
    test2 = next((t for t in tests if '2-нұсқа' in t['title']), None)
    if not test2:
        print("Test 2 not found!")
        return

    tasks = await db.trial_tests.get_trial_test_tasks(test2['id'])
    for t in tasks:
        slot = int(t['sort_order']) + 1
        if 26 <= slot <= 30:
            bt = await db.bank_tasks.get_task_by_id(t['bank_task_id'])
            topics = bt.get('topics') or []
            print(f"Slot {slot} (bank_task_id {t['bank_task_id']}): {topics}")
            if "Контекст" not in topics:
                new_topics = ["ҰБТ есебі", "Контекст"] + [top for top in topics if top not in ["ҰБТ есебі", "Контекст"]]
                async with db.bank_tasks._connection() as conn:
                    await db.bank_tasks._set_task_topics(conn, t['bank_task_id'], new_topics)
                    await conn.commit()
                print(f"  -> Updated with 'Контекст': {new_topics}")

    print("Finished checking and updating Variant 2 topics!")

if __name__ == '__main__':
    asyncio.run(main())
