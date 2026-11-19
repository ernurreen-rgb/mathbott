"""
Routes for data export
"""
import csv
import json
import logging
import re
from io import StringIO

import storage as db_driver
from fastapi import Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from dependencies import require_admin_review_manage, require_internal_identity

logger = logging.getLogger(__name__)
CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")
_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_csv_value(value) -> str:
    text = "" if value is None else str(value)
    stripped = text.lstrip(" \t\r\n")
    if text.startswith(CSV_FORMULA_PREFIXES) or stripped.startswith(("=", "+", "-", "@")):
        return "'" + text
    return text


def _safe_export_filename_stem(email: str) -> str:
    cleaned = _SAFE_FILENAME_RE.sub("_", (email or "").strip().lower()).strip("._-")
    return (cleaned or "user")[:100]


def _csv_line(row) -> str:
    output = StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow([_safe_csv_value(value) for value in row])
    return output.getvalue()


def _row_value(row, key: str, default=""):
    if hasattr(row, "keys") and key in row.keys():
        return row[key]
    if isinstance(row, dict):
        return row.get(key, default)
    return default


def setup_export_routes(app, db, limiter=None):
    """Setup export routes"""

    def _apply_limit(rate: str):
        if limiter is not None:
            return limiter.limit(rate)
        return lambda fn: fn

    @app.get("/api/export/user/{email}")
    @_apply_limit("5/minute")
    async def export_user_data(
        request: Request,
        email: str,
        format: str = Query("json", pattern="^(json|csv)$"),
        current_user: dict = Depends(require_internal_identity),
    ):
        """Export authenticated user data and progress."""
        requested_email = email.strip().lower()
        if current_user["email"].strip().lower() != requested_email:
            raise HTTPException(status_code=403, detail="Access denied")

        user = await db.users.get_user_by_email(current_user["email"])
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        filename_stem = _safe_export_filename_stem(user["email"])

        if format == "csv":
            async def generate_csv():
                async with db.users._connection() as conn:
                    conn.row_factory = db_driver.Row

                    yield _csv_line(["Field", "Value"])
                    yield _csv_line(["Email", user["email"]])
                    yield _csv_line(["Nickname", user.get("nickname", "")])
                    yield _csv_line(["Total Solved", user["total_solved"]])
                    yield "\n"

                    yield _csv_line(["Progress"])
                    yield _csv_line(["Task ID", "Status", "Completed At"])
                    async with conn.execute(
                        "SELECT task_id, status, completed_at FROM user_progress WHERE user_id = ?",
                        (user["id"],),
                    ) as cursor:
                        async for row in cursor:
                            yield _csv_line([row["task_id"], row["status"], _row_value(row, "completed_at")])
                    yield "\n"

                    yield _csv_line(["Solutions"])
                    yield _csv_line(["Task ID", "Answer", "Is Correct", "Created At"])
                    async with conn.execute(
                        "SELECT task_id, answer, is_correct, created_at FROM solutions WHERE user_id = ? ORDER BY created_at DESC",
                        (user["id"],),
                    ) as cursor:
                        async for row in cursor:
                            yield _csv_line([row["task_id"], row["answer"], row["is_correct"], _row_value(row, "created_at")])

            return StreamingResponse(
                generate_csv(),
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="user_data_{filename_stem}.csv"'},
            )
        else:
            async def generate_json():
                async with db.users._connection() as conn:
                    conn.row_factory = db_driver.Row

                    yield '{\n  "user": {\n'
                    yield f'    "id": {json.dumps(user["id"])},\n'
                    yield f'    "email": {json.dumps(user["email"])},\n'
                    yield f'    "nickname": {json.dumps(user.get("nickname"))},\n'
                    yield f'    "total_solved": {json.dumps(user["total_solved"])},\n'
                    yield f'    "streak": {json.dumps(user.get("streak", 0))}\n'
                    yield '  },\n'

                    yield '  "progress": [\n'
                    first = True
                    async with conn.execute(
                        "SELECT * FROM user_progress WHERE user_id = ?",
                        (user["id"],),
                    ) as cursor:
                        async for row in cursor:
                            if not first:
                                yield ",\n"
                            yield "    " + json.dumps(dict(row), default=str)
                            first = False
                    yield '\n  ],\n'

                    yield '  "solutions": [\n'
                    first = True
                    async with conn.execute(
                        "SELECT * FROM solutions WHERE user_id = ? ORDER BY created_at DESC",
                        (user["id"],),
                    ) as cursor:
                        async for row in cursor:
                            if not first:
                                yield ",\n"
                            yield "    " + json.dumps(dict(row), default=str)
                            first = False
                    yield '\n  ],\n'

                achievements = await db.achievements.get_user_achievements(user["id"])
                yield '  "achievements": ' + json.dumps(achievements, default=str) + ',\n'

                modules = await db.curriculum.get_all_modules()
                yield '  "modules_progress": [\n'
                for i, module in enumerate(modules):
                    if i > 0:
                        yield ",\n"
                    module_progress = await db.calculate_module_completion(user["id"], module["id"])
                    yield "    " + json.dumps(
                        {
                            "module_id": module["id"],
                            "module_name": module["name"],
                            "progress": module_progress,
                        },
                        default=str,
                    )
                yield '\n  ]\n'
                yield '}'

            return StreamingResponse(
                generate_json(),
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="user_data_{filename_stem}.json"'},
            )

    @app.get("/api/export/admin/stats")
    @_apply_limit("10/minute")
    async def export_admin_stats(
        request: Request,
        format: str = Query("json", pattern="^(json|csv)$"),
        _admin_user: dict = Depends(require_admin_review_manage),
    ):
        """Export admin statistics (admin only)."""
        async with db.users._connection() as conn:
            conn.row_factory = db_driver.Row

            async with conn.execute("SELECT COUNT(*) as count FROM users") as cursor:
                total_users = (await cursor.fetchone())[0]

            async with conn.execute("SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NULL") as cursor:
                total_tasks = (await cursor.fetchone())[0]

            async with conn.execute("SELECT COUNT(*) as count FROM solutions") as cursor:
                total_solutions = (await cursor.fetchone())[0]

        data = {
            "total_users": total_users,
            "total_tasks": total_tasks,
            "total_solutions": total_solutions,
        }

        if format == "csv":
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(["Metric", "Value"])
            writer.writerow(["Total Users", total_users])
            writer.writerow(["Total Tasks", total_tasks])
            writer.writerow(["Total Solutions", total_solutions])

            output.seek(0)
            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={"Content-Disposition": 'attachment; filename="admin_stats.csv"'},
            )
        else:
            return Response(
                content=json.dumps(data, indent=2, default=str),
                media_type="application/json",
                headers={"Content-Disposition": 'attachment; filename="admin_stats.json"'},
            )
