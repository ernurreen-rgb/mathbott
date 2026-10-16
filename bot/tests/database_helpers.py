"""Native constraint-failure injection for SQLite and PostgreSQL tests."""
import re


async def create_reject_trigger(connection, table, name, message="simulated write failure"):
    assert re.fullmatch(r"[a-z_]+", table) and re.fullmatch(r"[a-z_]+", name)
    literal = message.replace("'", "''")
    if getattr(connection, "dialect", "sqlite") == "postgresql":
        await connection.execute(f"""CREATE FUNCTION {name}() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION '{literal}' USING ERRCODE = '23514'; END; $$""")
        await connection.execute(f"CREATE TRIGGER {name} BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION {name}()")
    else:
        await connection.execute(f"CREATE TRIGGER {name} BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT, '{literal}'); END")


async def drop_reject_trigger(connection, table, name):
    assert re.fullmatch(r"[a-z_]+", table) and re.fullmatch(r"[a-z_]+", name)
    if getattr(connection, "dialect", "sqlite") == "postgresql":
        await connection.execute(f"DROP TRIGGER {name} ON {table}")
        await connection.execute(f"DROP FUNCTION {name}()")
    else:
        await connection.execute(f"DROP TRIGGER {name}")
