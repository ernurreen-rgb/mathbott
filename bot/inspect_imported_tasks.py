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

async def inspect_tests():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    for test_id, name in [(17, "Variant 1"), (18, "Variant 2")]:
        print(f"\n================ {name} (ID: {test_id}) ================")
        tasks = await db.trial_tests.get_trial_test_tasks(test_id)
        for t in tasks:
            slot = t['sort_order'] + 1
            qtype = t.get('question_type')
            ans = t.get('answer')
            img = t.get('image_filename')
            opts = t.get('options')
            if isinstance(opts, str):
                try: opts = json.loads(opts)
                except: pass
            subqs = t.get('subquestions')
            if isinstance(subqs, str):
                try: subqs = json.loads(subqs)
                except: pass
            
            # Print summary of task
            print(f"Slot {slot:02d} | type={qtype} | ans={ans} | img={img} | opts={len(opts) if opts else 0} | subqs={len(subqs) if subqs else 0}")
            text_preview = t.get('text', '').replace('\n', ' ')[:70]
            print(f"   text: {text_preview}")

if __name__ == '__main__':
    asyncio.run(inspect_tests())
