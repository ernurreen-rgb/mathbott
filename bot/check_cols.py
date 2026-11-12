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
    cols = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bank_tasks'")
    for c in cols:
        print(c['column_name'], c['data_type'])
    await conn.close()

asyncio.run(main())
