import os
import asyncpg
import asyncio

def load_env(path):
    env = {}
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            v = v.strip().strip('"').strip("'")
            env[k] = v
    return env

async def main():
    env = load_env('.env.prod.test')
    db_url = env.get('DATABASE_URL')
    if not db_url:
        print("No DATABASE_URL")
        return
    conn = await asyncpg.connect(db_url)
    
    print("=== Trial Test Folders in Prod ===")
    folders = await conn.fetch("SELECT * FROM trial_test_folders")
    for f in folders:
        print(dict(f))
        
    print("\n=== Trial Tests in Prod ===")
    tests = await conn.fetch("SELECT id, title, category, folder_id FROM trial_tests")
    for t in tests:
        print(dict(t))
        
    await conn.close()

asyncio.run(main())
