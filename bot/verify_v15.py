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
    test = next((t for t in tests if "15-нұсқа: Үш дос" in t["title"]), None)
    if not test:
        print("Test '15-нұсқа: Үш дос' not found!")
        return

    print(f"Test found: {test['title']} (ID: {test['id']}, folder_id: {test['folder_id']})")
    
    tasks = await db.trial_tests.get_trial_test_tasks(test["id"])
    print(f"Tasks count: {len(tasks)}")
    assert len(tasks) == 40, f"Expected 40 tasks, got {len(tasks)}"

    dollar_sign = chr(36)
    for t in sorted(tasks, key=lambda x: int(x["sort_order"])):
        slot = int(t["sort_order"]) + 1
        q_type = t["question_type"]
        text = t["text"]
        ans = t["answer"]
        img = t.get("image_filename")

        assert dollar_sign not in text, f"Slot {slot} has dollar sign in text"

        # Check types
        if 1 <= slot <= 30:
            assert q_type == 'mcq', f"Slot {slot} expected mcq, got {q_type}"
        elif 31 <= slot <= 35:
            assert q_type == 'select', f"Slot {slot} expected select, got {q_type}"
        elif 36 <= slot <= 40:
            assert q_type == 'mcq6', f"Slot {slot} expected mcq6, got {q_type}"

        # Get actual bank task to check topics
        bt = await db.bank_tasks.get_task_by_id(t["bank_task_id"])
        top = bt.get("topics", [])
        
        # Verify slots 26-30 have 'Контекст'
        if 26 <= slot <= 30:
            assert "Контекст" in top, f"Slot {slot} missing 'Контекст' in topics: {top}"
            assert img == "v15_context_ush_dos.png", f"Slot {slot} unexpected image: {img}"
        elif slot == 18:
            assert img == "v15_q18_integral.png", f"Slot 18 unexpected image: {img}"
        elif slot == 19:
            assert img == "v15_q19_circle.png", f"Slot 19 unexpected image: {img}"
        elif slot == 40:
            assert img == "v15_q40_pyramid.png", f"Slot 40 unexpected image: {img}"
        else:
            assert img is None, f"Slot {slot} expected None image, got {img}"

        print(f"Slot {slot:02d} [{q_type:6s}]: ans={ans:8s}, img={str(img):25s}, topics={top}")

    print("\n--- ALL CHECKS PASSED: VARIANT 15 FULLY VERIFIED! ---")

if __name__ == '__main__':
    asyncio.run(verify())
