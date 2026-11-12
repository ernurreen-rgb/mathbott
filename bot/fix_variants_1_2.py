import asyncio
import json
import re
import sys
from pathlib import Path

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))

from database import Database
from check_existing_format import get_db_url

def clean_dollar_text(s: str) -> str:
    if not s:
        return s
    # Strip all dollar signs
    cleaned = s.replace('$', '')
    # Clean up double spaces that might have been left
    cleaned = re.sub(r'[ \t]{2,}', ' ', cleaned)
    return cleaned.strip()

def parse_labels_list(raw_ans) -> list:
    if not raw_ans:
        return []
    if isinstance(raw_ans, list):
        return [str(x).strip().upper() for x in raw_ans if str(x).strip()]
    raw_str = str(raw_ans).strip()
    try:
        parsed = json.loads(raw_str)
        if isinstance(parsed, list):
            return [str(x).strip().upper() for x in parsed if str(x).strip()]
    except:
        pass
    # Split by comma or semicolon
    parts = re.split(r'[,;|\s]+', raw_str)
    return [p.strip().upper() for p in parts if p.strip()]

async def fix_variants():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    # Specific known correct answers for Variant 1 (Test 17)
    v1_answers = {
        31: json.dumps(["B", "C"]),
        32: json.dumps(["B", "C"]),
        33: json.dumps(["A", "C"]),
        34: json.dumps(["B", "C"]),
        35: json.dumps(["C", "A"]),
        36: json.dumps(["A", "D"]),
        37: json.dumps(["B", "D", "F"]),
        38: json.dumps(["A", "E"]),
        39: json.dumps(["C", "F"]),
        40: json.dumps(["A", "E", "F"]),
    }

    # Specific known correct answers for Variant 2 (Test 18)
    v2_answers = {
        31: json.dumps(["D", "A"]),
        32: json.dumps(["C", "D"]),
        33: json.dumps(["C", "B"]),
        34: json.dumps(["D", "A"]),
        35: json.dumps(["B", "C"]),
        36: json.dumps(["A", "F"]),
        37: json.dumps(["D", "F"]),
        38: "A",
        39: json.dumps(["C", "E"]),
        40: json.dumps(["B", "D"]),
    }

    variants = [
        (17, "Variant 1: Жылыжайдағы су", v1_answers),
        (18, "Variant 2: Икосаэдр", v2_answers),
    ]

    for test_id, vname, custom_answers in variants:
        print(f"\n================ Fixing {vname} (Test ID {test_id}) ================")
        tasks = await db.trial_tests.get_trial_test_tasks(test_id)
        tasks = sorted(tasks, key=lambda x: x.get('sort_order', 0))

        for t in tasks:
            bank_task_id = t.get('bank_task_id')
            if not bank_task_id:
                print(f"Warning: task has no bank_task_id: {t}")
                continue
            slot = t.get('sort_order', 0) + 1
            raw_text = t.get('text', '')
            cleaned_text = clean_dollar_text(raw_text)

            # Clean options
            opts = t.get('options')
            if isinstance(opts, str):
                try: opts = json.loads(opts)
                except: opts = []
            cleaned_opts = []
            if opts:
                for o in opts:
                    cleaned_opts.append({
                        "label": o.get('label', '').strip().upper(),
                        "text": clean_dollar_text(o.get('text', ''))
                    })

            # Clean subquestions
            subqs = t.get('subquestions')
            if isinstance(subqs, str):
                try: subqs = json.loads(subqs)
                except: subqs = None
            cleaned_subqs = None
            if subqs:
                cleaned_subqs = []
                for sq in subqs:
                    cleaned_subqs.append({
                        "text": clean_dollar_text(sq.get('text', '')),
                        "correct": sq.get('correct', '').strip().upper()
                    })

            # Determine question_type and answer
            if slot <= 30:
                qtype = "mcq"
                ans = t.get('answer', '').strip().upper()
            elif 31 <= slot <= 35:
                qtype = "select"
                if slot in custom_answers:
                    ans = custom_answers[slot]
                elif cleaned_subqs and len(cleaned_subqs) >= 2:
                    ans = json.dumps([cleaned_subqs[0]['correct'], cleaned_subqs[1]['correct']])
                else:
                    ans = custom_answers.get(slot, t.get('answer'))
            else: # 36..40
                qtype = "mcq6"
                if slot in custom_answers:
                    ans = custom_answers[slot]
                else:
                    labels = parse_labels_list(t.get('answer'))
                    ans = labels[0] if len(labels) == 1 else json.dumps(sorted(labels))

            # Update bank task
            async with db.bank_tasks._connection() as conn:
                await conn.execute(
                    """
                    UPDATE bank_tasks
                    SET text = %s,
                        options = %s,
                        subquestions = %s,
                        question_type = %s,
                        answer = %s
                    WHERE id = %s
                    """,
                    (
                        cleaned_text,
                        json.dumps(cleaned_opts, ensure_ascii=False) if cleaned_opts else None,
                        json.dumps(cleaned_subqs, ensure_ascii=False) if cleaned_subqs else None,
                        qtype,
                        ans,
                        bank_task_id
                    )
                )
                await conn.commit()
            print(f"Slot {slot:02d} (bank_task_id={bank_task_id}) updated: type={qtype}, ans={ans}")

    print("\n--- ALL TASKS IN VARIANTS 1 AND 2 HAVE BEEN FIXED AND CLEANED! ---")

if __name__ == '__main__':
    asyncio.run(fix_variants())
