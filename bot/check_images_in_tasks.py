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
    conn = await asyncpg.connect(db_url)
    rows = await conn.fetch("SELECT id, image_filename FROM bank_tasks WHERE image_filename IS NOT NULL AND image_filename != '' LIMIT 10")
    print("Bank tasks with image_filename:", len(rows))
    for r in rows:
        print(dict(r))
    await conn.close()

asyncio.run(main())
