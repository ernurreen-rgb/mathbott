"""Bounded maintenance cycle shared by server startup and scheduled requests."""
from services.ops_monitor import OpsMonitor
from settings import get_settings


async def run_maintenance_cycle(db, monitor=None):
    monitor = monitor or OpsMonitor(db)
    tasks = await db.tasks.cleanup_old_deleted_tasks(days=10)
    bank = await db.bank_tasks.cleanup_old_deleted_tasks(days=get_settings().bank_trash_retention_days)
    retention = await monitor.run_cleanup()
    await monitor.run_cycle()
    return {"tasks_deleted": tasks, "bank_tasks_deleted": bank, "retention": retention}
