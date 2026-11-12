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
        print(f"\n==================== {vname} (Test ID {test_id}) ====================")
        for t in sorted(tasks, key=lambda x: x.get('sort_order', 0)):
            slot = t.get('sort_order', 0) + 1
            tid = t.get('id')
            qtype = t.get('question_type')
            ans = t.get('answer')
            text = t.get('text', '')
            has_dollar_in_text = '$' in text
            opts = t.get('options')
            if isinstance(opts, str):
                try: opts = json.loads(opts)
                except: pass
            subqs = t.get('subquestions')
            if isinstance(subqs, str):
                try: subqs = json.loads(subqs)
                except: pass
            
            dollar_in_opts = any('$' in str(o.get('text', '')) for o in opts) if opts else False
            dollar_in_subqs = any('$' in str(sq.get('text', '')) for sq in subqs) if subqs else False
            
            issues = []
            if has_dollar_in_text or dollar_in_opts or dollar_in_subqs:
                issues.append("HAS_DOLLAR")
            if slot <= 30 and qtype != "mcq":
                issues.append(f"QTYPE({qtype}!=mcq)")
            if 31 <= slot <= 35 and qtype != "select":
                issues.append(f"QTYPE({qtype}!=select)")
            if 36 <= slot <= 40 and qtype != "mcq6":
                issues.append(f"QTYPE({qtype}!=mcq6)")
            if 31 <= slot <= 35:
                # check answer is json array
                if not (ans and ans.startswith('[') and ans.endswith(']')):
                    issues.append(f"SELECT_ANS_NOT_JSON({ans})")
            if 36 <= slot <= 40:
                # check answer format
                if ',' in str(ans) and not (ans.startswith('[') and ans.endswith(']')):
                    issues.append(f"MCQ6_ANS_NOT_JSON({ans})")
            
            print(f"Slot {slot:02d} (id={tid}) | type={qtype:6s} | ans={ans!s:12s} | issues={','.join(issues) or 'OK'}")
            if issues:
                print(f"   text: {text[:60]}")
                if opts:
                    print(f"   opts: {[o.get('text') for o in opts[:3]]}")

if __name__ == '__main__':
    asyncio.run(main())
