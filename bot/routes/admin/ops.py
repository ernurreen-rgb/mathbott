"""
Admin ops routes.
"""
from .common import *  # noqa: F401,F403

def register_ops_routes(app: FastAPI, db: Database, limiter: Limiter):
    # Ops / Production health
    @app.get("/api/admin/ops/health/summary")
    async def get_admin_ops_health_summary(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
    ):
        sample = await db.get_latest_ops_health_sample()
        if sample is None:
            db_ok = await db.probe_database()
            window = metrics.get_window_stats(window_seconds=300)
            sample = {
                "service_status": "healthy" if db_ok else "down",
                "database_status": "ok" if db_ok else "error",
                "requests_5m": int(window.get("requests", 0) or 0),
                "errors_5m": int(window.get("errors", 0) or 0),
                "error_rate_5m": float(window.get("error_rate", 0.0) or 0.0),
                "p95_ms_5m": float(window.get("p95_ms", 0.0) or 0.0),
                "avg_ms_5m": float(window.get("avg_ms", 0.0) or 0.0),
                "collected_at": datetime.utcnow().isoformat(),
            }

        open_incidents = await db.get_open_ops_incidents_count()
        return {
            "service_status": sample.get("service_status") or "healthy",
            "database_status": sample.get("database_status") or "ok",
            "window": "5m",
            "requests_5m": int(sample.get("requests_5m") or 0),
            "errors_5m": int(sample.get("errors_5m") or 0),
            "error_rate_5m": float(sample.get("error_rate_5m") or 0.0),
            "p95_ms_5m": float(sample.get("p95_ms_5m") or 0.0),
            "avg_ms_5m": float(sample.get("avg_ms_5m") or 0.0),
            "open_incidents": int(open_incidents),
            "updated_at": sample.get("collected_at") or datetime.utcnow().isoformat(),
        }

    @app.get("/api/admin/ops/health/timeseries")
    async def get_admin_ops_health_timeseries(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        range_value: str = Query("24h", alias="range"),
        step: Optional[str] = Query(None),
    ):
        normalized_range = str(range_value or "").strip().lower()
        if normalized_range not in OPS_TIMESERIES_RANGES:
            raise HTTPException(status_code=400, detail="range must be one of 1h, 24h, 7d")

        normalized_step = str(step or OPS_TIMESERIES_DEFAULT_STEP[normalized_range]).strip().lower()
        if normalized_step not in OPS_TIMESERIES_STEPS:
            raise HTTPException(status_code=400, detail="step must be one of 1m, 5m, 1h")

        items = await db.get_ops_health_timeseries(
            range_sql=OPS_TIMESERIES_RANGES[normalized_range],
            step_seconds=OPS_TIMESERIES_STEPS[normalized_step],
        )
        return {
            "range": normalized_range,
            "step": normalized_step,
            "items": items,
        }

    @app.get("/api/admin/ops/incidents")
    async def get_admin_ops_incidents(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        status: str = Query("open"),
        severity: str = Query("all"),
        limit: int = Query(20),
        offset: int = Query(0),
    ):
        normalized_status = str(status or "").strip().lower()
        normalized_severity = str(severity or "").strip().lower()

        if normalized_status not in OPS_INCIDENT_STATUSES:
            raise HTTPException(status_code=400, detail="status must be one of open, resolved, all")
        if normalized_severity not in OPS_INCIDENT_SEVERITIES:
            raise HTTPException(status_code=400, detail="severity must be one of critical, high, medium, all")
        if limit < 1 or limit > 100:
            raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
        if offset < 0:
            raise HTTPException(status_code=400, detail="offset must be >= 0")

        return await db.list_ops_incidents(
            status=normalized_status,
            severity=normalized_severity,
            limit=limit,
            offset=offset,
        )

