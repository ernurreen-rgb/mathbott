import asyncio
import json
import sys
from pathlib import Path

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))

from database import Database
from check_existing_format import get_db_url

async def main():
    db = Database(get_db_url(), use_pool=True, auto_migrate=False)
    await db.init()
    
    for test_id, vname in [(17, "Variant 1"), (18, "Variant 2")]:
        tasks = await db.trial_tests.get_trial_test_tasks(test_id)
        tasks = sorted(tasks, key=lambda x: x.get('sort_order', 0))
        print(f"\n==================== {vname} (Test ID {test_id}) ====================")
        for t in tasks:
            slot = t.get('sort_order', 0) + 1
            tid = t.get('id')
            qtype = t.get('question_type')
            ans = t.get('answer')
            text = t.get('text', '')
            img = t.get('image_filename')
            opts = t.get('options')
            if isinstance(opts, str):
                try: opts = json.loads(opts)
                except: pass
            subqs = t.get('subquestions')
            if isinstance(subqs, str):
                try: subqs = json.loads(subqs)
                except: pass
            
            print(f"--- Slot {slot:02d} (id={tid}, type={qtype}, ans={ans}, img={img}) ---")
            print(f"Text: {text}")
            if subqs:
                print(f"Subqs: {subqs}")
            if opts:
                print(f"Opts ({len(opts)}): {[o['label'] + ': ' + o['text'] for o in opts]}")

if __name__ == '__main__':
    asyncio.run(main())
