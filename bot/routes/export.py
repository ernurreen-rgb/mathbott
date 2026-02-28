"""
Routes for data export
"""
import logging
import csv
import json
from io import StringIO
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

logger = logging.getLogger(__name__)


def setup_export_routes(app, db):
    """Setup export routes"""
    
    @app.get("/api/export/user/{email}")
    async def export_user_data(
        email: str,
        format: str = Query("json", pattern="^(json|csv)$")
    ):
        """
        Export user data and progress
        
        **Example Request:**
        ```
        GET /api/export/user/user@example.com?format=json
        GET /api/export/user/user@example.com?format=csv
        ```
        
        **Example Response (JSON):**
        ```json
        {
          "user": {
            "id": 1,
            "email": "user@example.com",
            "nickname": "TestUser",
            "league": "Қола",
            "total_solved": 50,
            "total_points": 500
          },
          "progress": [
            {
              "task_id": 1,
              "status": "completed",
              "completed_at": "2024-01-15T10:00:00Z"
            }
          ],
          "solutions": [
            {
              "task_id": 1,
              "answer": "42",
              "is_correct": true,
              "created_at": "2024-01-15T10:00:00Z"
            }
          ],
          "achievements": [
            {
              "id": 1,
              "name": "First Solve",
              "unlocked": true,
              "unlocked_at": "2024-01-10T10:00:00Z"
            }
          ]
        }
        ```
        
        **Error Codes:**
        - 200: Success
        - 404: User not found
        - 500: Internal server error
        """
        user = await db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Use streaming for large datasets
        if format == "csv":
            # Stream CSV data
            async def generate_csv():
                import aiosqlite
                conn = await db._get_connection() if hasattr(db, '_get_connection') else None
                use_pool = conn is not None
                
                if not use_pool:
                    conn = await aiosqlite.connect(db.db_path)
                    await db._configure_connection(conn)
                
                try:
                    conn.row_factory = aiosqlite.Row
                    
                    # Yield CSV header and user info
                    yield "Field,Value\n"
                    yield f"Email,{user['email']}\n"
                    yield f"Nickname,{user.get('nickname', '')}\n"
                    yield f"League,{user['league']}\n"
                    yield f"Total Solved,{user['total_solved']}\n"
                    yield f"Total Points,{user['total_points']}\n"
                    yield "\n"
                    
                    # Stream progress
                    yield "Progress\n"
                    yield "Task ID,Status,Completed At\n"
                    async with conn.execute(
                        "SELECT task_id, status, completed_at FROM user_progress WHERE user_id = ?",
                        (user["id"],)
                    ) as cursor:
                        async for row in cursor:
                            yield f"{row['task_id']},{row['status']},{row.get('completed_at', '')}\n"
                    yield "\n"
                    
                    # Stream solutions
                    yield "Solutions\n"
                    yield "Task ID,Answer,Is Correct,Created At\n"
                    async with conn.execute(
                        "SELECT task_id, answer, is_correct, created_at FROM solutions WHERE user_id = ? ORDER BY created_at DESC",
                        (user["id"],)
                    ) as cursor:
                        async for row in cursor:
                            yield f"{row['task_id']},{row['answer']},{row['is_correct']},{row.get('created_at', '')}\n"
                finally:
                    if use_pool and hasattr(db, '_release_connection'):
                        await db._release_connection(conn)
                    elif not use_pool:
                        await conn.close()
            
            return StreamingResponse(
                generate_csv(),
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="user_data_{email}.csv"'}
            )
        else:
            # For JSON, use streaming for large datasets
            async def generate_json():
                import aiosqlite
                conn = await db._get_connection() if hasattr(db, '_get_connection') else None
                use_pool = conn is not None
                
                if not use_pool:
                    conn = await aiosqlite.connect(db.db_path)
                    await db._configure_connection(conn)
                
                try:
                    conn.row_factory = aiosqlite.Row
                    
                    # Start JSON object
                    yield '{\n  "user": {\n'
                    yield f'    "id": {user["id"]},\n'
                    yield f'    "email": "{user["email"]}",\n'
                    yield f'    "nickname": {json.dumps(user.get("nickname"))},\n'
                    yield f'    "league": "{user["league"]}",\n'
                    yield f'    "total_solved": {user["total_solved"]},\n'
                    yield f'    "total_points": {user["total_points"]},\n'
                    yield f'    "week_solved": {user["week_solved"]},\n'
                    yield f'    "week_points": {user["week_points"]},\n'
                    yield f'    "streak": {user.get("streak", 0)}\n'
                    yield '  },\n'
                    
                    # Stream progress array
                    yield '  "progress": [\n'
                    first = True
                    async with conn.execute(
                        "SELECT * FROM user_progress WHERE user_id = ?",
                        (user["id"],)
                    ) as cursor:
                        async for row in cursor:
                            if not first:
                                yield ",\n"
                            yield "    " + json.dumps(dict(row), default=str)
                            first = False
                    yield '\n  ],\n'
                    
                    # Stream solutions array
                    yield '  "solutions": [\n'
                    first = True
                    async with conn.execute(
                        "SELECT * FROM solutions WHERE user_id = ? ORDER BY created_at DESC",
                        (user["id"],)
                    ) as cursor:
                        async for row in cursor:
                            if not first:
                                yield ",\n"
                            yield "    " + json.dumps(dict(row), default=str)
                            first = False
                    yield '\n  ],\n'
                    
                    # Get achievements (small dataset, can load all)
                    achievements = await db.get_user_achievements(user["id"])
                    yield '  "achievements": ' + json.dumps(achievements, default=str) + ',\n'
                    
                    # Get modules progress (stream if many modules)
                    modules = await db.get_all_modules()
                    yield '  "modules_progress": [\n'
                    for i, module in enumerate(modules):
                        if i > 0:
                            yield ",\n"
                        module_progress = await db.calculate_module_completion(user["id"], module["id"])
                        yield "    " + json.dumps({
                            "module_id": module["id"],
                            "module_name": module["name"],
                            "progress": module_progress
                        }, default=str)
                    yield '\n  ]\n'
                    yield '}'
                finally:
                    if use_pool and hasattr(db, '_release_connection'):
                        await db._release_connection(conn)
                    elif not use_pool:
                        await conn.close()
            
            return StreamingResponse(
                generate_json(),
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="user_data_{email}.json"'}
            )
    
    @app.get("/api/export/admin/stats")
    async def export_admin_stats(
        email: str = Query(...),
        format: str = Query("json", pattern="^(json|csv)$")
    ):
        """
        Export admin statistics (admin only)
        
        **Example Request:**
        ```
        GET /api/export/admin/stats?email=admin@example.com&format=json
        ```
        
        **Error Codes:**
        - 200: Success
        - 403: Access denied (not admin)
        - 500: Internal server error
        """
        if not await db.is_admin(email=email):
            raise HTTPException(status_code=403, detail="Access denied. Admin rights required.")
        
        # Get statistics
        import aiosqlite
        async with aiosqlite.connect(db.db_path) as conn:
            await db._configure_connection(conn)
            conn.row_factory = aiosqlite.Row
            
            # Total users
            async with conn.execute("SELECT COUNT(*) as count FROM users") as cursor:
                total_users = (await cursor.fetchone())[0]
            
            # Total tasks
            async with conn.execute("SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NULL") as cursor:
                total_tasks = (await cursor.fetchone())[0]
            
            # Total solutions
            async with conn.execute("SELECT COUNT(*) as count FROM solutions") as cursor:
                total_solutions = (await cursor.fetchone())[0]
            
            # Users by league
            async with conn.execute(
                "SELECT league, COUNT(*) as count FROM users GROUP BY league"
            ) as cursor:
                league_stats = {row[0]: row[1] for row in await cursor.fetchall()}
        
        data = {
            "total_users": total_users,
            "total_tasks": total_tasks,
            "total_solutions": total_solutions,
            "users_by_league": league_stats
        }
        
        if format == "csv":
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(["Metric", "Value"])
            writer.writerow(["Total Users", total_users])
            writer.writerow(["Total Tasks", total_tasks])
            writer.writerow(["Total Solutions", total_solutions])
            writer.writerow([])
            writer.writerow(["League", "User Count"])
            for league, count in league_stats.items():
                writer.writerow([league, count])
            
            output.seek(0)
            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={"Content-Disposition": 'attachment; filename="admin_stats.csv"'}
            )
        else:
            return Response(
                content=json.dumps(data, indent=2, default=str),
                media_type="application/json",
                headers={"Content-Disposition": 'attachment; filename="admin_stats.json"'}
            )

