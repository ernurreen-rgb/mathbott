"""Bounded maintenance cycle shared by server startup and scheduled requests."""
from services.ops_monitor import OpsMonitor
from settings import get_settings


async def run_maintenance_cycle(db, monitor=None):
    monitor = monitor or OpsMonitor(db)
    tasks = await db.tasks.cleanup_old_deleted_tasks(days=10)
    bank = await db.bank_tasks.cleanup_old_deleted_tasks(days=get_settings().bank_trash_retention_days)
    entry_limits = await db.quizzes.cleanup_entry_limits()
    # Student activity records share one retention period (PAGE_VISIT_RETENTION_DAYS).
    activity_days = get_settings().page_visit_retention_days
    page_visits = await db.users.cleanup_old_page_visits(activity_days)
    prompt_events = await db.push.cleanup_old_prompt_events(activity_days)
    retention = await monitor.run_cleanup()
    await monitor.run_cycle()
    return {"tasks_deleted": tasks, "bank_tasks_deleted": bank, "quiz_entry_limits_deleted": entry_limits,
            "page_visits_deleted": page_visits, "reminder_prompt_events_deleted": prompt_events,
            "retention": retention}
