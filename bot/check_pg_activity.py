import asyncio
import psycopg
from pathlib import Path

def get_db_url():
    with open('bot/.env.prod.test', 'r') as f:
        for line in f:
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

async def main():
    conn = await psycopg.AsyncConnection.connect(get_db_url())
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT pid, state, wait_event_type, wait_event, query 
            FROM pg_stat_activity 
            WHERE datname = current_database()
        """)
        rows = await cur.fetchall()
        for r in rows:
            print(r)
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
