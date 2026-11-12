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
    for t in sorted(tests, key=lambda x: x['id']):
        tasks = await db.trial_tests.get_trial_test_tasks(t['id'])
        print(f"\nTest {t['id']}: {t['title']} ({len(tasks)} tasks)")
        missing_kontext = []
        for task in tasks:
            slot = int(task['sort_order']) + 1
            if 26 <= slot <= 30:
                bt = await db.bank_tasks.get_task_by_id(task['bank_task_id'])
                topics = bt.get('topics') or []
                if "Контекст" not in topics:
                    missing_kontext.append(slot)
                    # Add it
                    new_topics = ["ҰБТ есебі", "Контекст"] + [top for top in topics if top not in ["ҰБТ есебі", "Контекст"]]
                    async with db.bank_tasks._connection() as conn:
                        await db.bank_tasks._set_task_topics(conn, task['bank_task_id'], new_topics)
                        await conn.commit()
        if missing_kontext:
            print(f"  Fixed missing 'Контекст' on slots: {missing_kontext}", flush=True)
        else:
            print(f"  All context slots (26-30) have 'Контекст' tag: OK", flush=True)
    await db.close()

if __name__ == '__main__':
    asyncio.run(main())
