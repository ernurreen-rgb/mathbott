import asyncio
import os
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

async def create_folder():
    db_url = get_db_url()
    db = Database(db_url, use_pool=False, auto_migrate=False)
    await db.init()
    
    folders = await db.trial_tests.get_trial_test_folders(include_empty=True)
    existing = next((f for f in folders if f['name'] == 'ҰБТ есептері' and f['parent_id'] is None), None)
    if existing:
        print(f"Folder 'ҰБТ есептері' already exists with ID: {existing['id']}")
        return existing['id']
    
    new_folder = await db.trial_tests.create_trial_test_folder(
        name='ҰБТ есептері',
        parent_id=None,
        sort_order=1
    )
    print("Created folder:", new_folder)
    return new_folder['id']

if __name__ == '__main__':
    asyncio.run(create_folder())
