"""
Mathbot - FastAPI backend
Entry point для запуска приложения
"""
import os
import logging
import asyncio
import aiosqlite
import uvicorn
from contextlib import asynccontextmanager

from fastapi import FastAPI

import instrument  # noqa: F401  # Initialize env/logging/Sentry as early as possible.

from app import create_app
from routes import register_routes
from config import validate_configuration
from utils.db_maintenance import DatabaseMaintenance
from services.ops_monitor import OpsMonitor

# Load environment уже выполнен в app.py

# Instrumentation bootstrap is done in instrument.py.
logger = logging.getLogger(__name__)
BANK_TRASH_RETENTION_DAYS = int(os.getenv("BANK_TRASH_RETENTION_DAYS", "30"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown: init DB, background tasks, then cleanup on exit."""
    # === startup ===
    validate_configuration()
    db = app.state.db
    await db.init()
    logger.info("Database initialized")

    try:
        async with aiosqlite.connect(db.db_path) as conn:
            async with conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='subtasks'") as cursor:
                result = await cursor.fetchone()
                if result:
                    logger.info("Subtasks table verified")
                else:
                    logger.warning("Subtasks table not found, will be created on next init")
    except Exception as e:
        logger.error(f"Error checking subtasks table: {e}")

    try:
        deleted_count = await db.cleanup_old_deleted_tasks(days=10)
        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} old deleted tasks")
    except Exception as e:
        logger.error(f"Error cleaning up old tasks: {e}")

    try:
        deleted_bank_count = await db.cleanup_old_deleted_bank_tasks(days=BANK_TRASH_RETENTION_DAYS)
        if deleted_bank_count > 0:
            logger.info(
                f"Cleaned up {deleted_bank_count} bank tasks older than {BANK_TRASH_RETENTION_DAYS} days"
            )
    except Exception as e:
        logger.error(f"Error cleaning up old bank tasks: {e}")

    ops_monitor = OpsMonitor(db)
    app.state.ops_monitor = ops_monitor
    try:
        await ops_monitor.run_cycle()
    except Exception as e:
        logger.error(f"Initial ops monitor cycle failed: {e}", exc_info=True)

    task_week = asyncio.create_task(check_and_reset_week(db))
    task_maint = asyncio.create_task(run_db_maintenance(db, BANK_TRASH_RETENTION_DAYS, ops_monitor))
    task_ops = asyncio.create_task(ops_monitor.run_loop())
    logger.info("Weekly reset checker started (runs every Monday at 00:00)")
    logger.info("Database maintenance started (runs daily at 03:00)")
    logger.info("Ops monitor started (runs every 60 seconds)")

    admin_email = os.getenv("ADMIN_EMAIL")
    if admin_email:
        user = await db.get_user_by_email(admin_email)
        if user:
            await db.set_admin_with_role(email=admin_email, is_admin=True, role="super_admin")
            logger.info(f"Admin set by email: {admin_email}")
        else:
            try:
                await db.create_user_by_email(admin_email, check_admin_email=admin_email)
                await db.set_admin_with_role(email=admin_email, is_admin=True, role="super_admin")
                logger.info(f"Admin user created and set by email: {admin_email}")
            except Exception as e:
                logger.warning(f"Failed to create admin user {admin_email}: {e}")

    yield

    # === shutdown ===
    task_week.cancel()
    task_maint.cancel()
    task_ops.cancel()
    await asyncio.gather(task_week, task_maint, task_ops, return_exceptions=True)
    if db.connection_pool:
        await db.connection_pool.close()
        logger.info("Connection pool closed")
    logger.info("API shutdown complete")


# Создать приложение
app = create_app(lifespan=lifespan)

# Зарегистрировать все роуты
register_routes(app, app.state.db, app.state.limiter)


async def check_and_reset_week(db):
    """Check if weekly reset is needed and perform it
    Resets happen every Monday at 00:00 (midnight)
    Checks every 5 minutes to catch the reset time
    """
    from datetime import datetime as dt
    
    while True:
        try:
            now = dt.now()
            # Check if it's Monday (weekday 0) and time is 00:00-00:05
            if now.weekday() == 0 and now.hour == 0 and now.minute < 5:
                result = await db.reset_week()
                if result:
                    logger.info(f"✅ Weekly reset performed at {now.strftime('%Y-%m-%d %H:%M:%S')}")
                    logger.info("📊 League promotions and demotions completed")
                await asyncio.sleep(55 * 60)
            else:
                await asyncio.sleep(5 * 60)
        except Exception as e:
            logger.error(f"Error in weekly reset check: {e}", exc_info=True)
            await asyncio.sleep(5 * 60)


async def run_db_maintenance(db, bank_trash_retention_days: int = 30, ops_monitor: OpsMonitor | None = None):
    """Run periodic database maintenance (ANALYZE)"""
    from datetime import datetime as dt
    
    maintenance = DatabaseMaintenance(db.db_path)
    
    while True:
        try:
            # Run ANALYZE daily at 3 AM
            now = dt.now()
            if now.hour == 3 and now.minute < 5:
                await maintenance.analyze()
                deleted_bank_count = await db.cleanup_old_deleted_bank_tasks(days=bank_trash_retention_days)
                if deleted_bank_count > 0:
                    logger.info(
                        f"Cleaned up {deleted_bank_count} bank tasks older than {bank_trash_retention_days} days"
                    )
                if ops_monitor is not None:
                    cleanup_result = await ops_monitor.run_cleanup()
                    logger.info(
                        "Ops cleanup complete: health=%s incidents=%s",
                        cleanup_result.get("deleted_health_samples", 0),
                        cleanup_result.get("deleted_incidents", 0),
                    )
                await asyncio.sleep(55 * 60)  # Sleep for 55 minutes
            else:
                await asyncio.sleep(5 * 60)  # Check every 5 minutes
        except Exception as e:
            logger.error(f"Error in database maintenance: {e}", exc_info=True)
            await asyncio.sleep(60 * 60)  # Wait 1 hour on error


async def run_api():
    """Run FastAPI server"""
    port = int(os.getenv("PORT", 8000))
    # Compression is handled by FastAPI's GZipMiddleware (properly handles Content-Length)
    config = uvicorn.Config(
        app, 
        host="0.0.0.0", 
        port=port, 
        log_level="info",
        loop="asyncio"
    )
    server = uvicorn.Server(config)
    await server.serve()


async def main():
    """Main function to run API"""
    await run_api()


if __name__ == "__main__":
    import asyncio
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
