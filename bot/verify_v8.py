import asyncio
import sys
from pathlib import Path

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))

from database import Database
from import_variant_8 import get_db_url

async def verify():
    db = Database(get_db_url(), use_pool=True, auto_migrate=False)
    await db.init()
    tests = await db.trial_tests.get_trial_tests(folder_id=11)
    test = next((t for t in tests if "8-нұсқа: Шатыр" in t["title"]), None)
    if not test:
        print("Test '8-нұсқа: Шатыр' not found!")
        return
    print(f"Test found: {test['title']} (ID: {test['id']}, folder_id: {test['folder_id']})")
    
    tasks = await db.trial_tests.get_trial_test_tasks(test["id"])
    print(f"Tasks count: {len(tasks)}")
    assert len(tasks) == 40, f"Expected 40 tasks, got {len(tasks)}"

    for t in sorted(tasks, key=lambda x: int(x["sort_order"])):
        slot = int(t["sort_order"]) + 1
        q_type = t["question_type"]
        ans = t["answer"]
        img = t.get("image_filename")
        
        # Get actual bank task to check topics
        bt = await db.bank_tasks.get_task_by_id(t["bank_task_id"])
        top = bt.get("topics")
        print(f"Slot {slot:02d} [{q_type}]: ans={ans}, img={img}, topics={top}")
        
        # Verify slots 26-30 have 'Контекст'
        if 26 <= slot <= 30:
            assert top and "Контекст" in top, f"Slot {slot} missing 'Контекст' in topics: {top}"
            assert img == "v8_q26_roof.png", f"Slot {slot} unexpected image: {img}"
            
        # Verify specific images
        if slot == 15:
            assert img == "v8_q15_parabola.png"
        elif slot == 23:
            assert img == "v8_q23_sin_graph.png"
        elif slot == 24:
            assert img == "v8_q24_trig_circles.png"

    print("\n--- ALL CHECKS PASSED: VARIANT 8 FULLY VERIFIED! ---")

if __name__ == "__main__":
    asyncio.run(verify())
