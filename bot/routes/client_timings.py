"""
Request timings from students' devices (web/lib/request-timing.ts).

The server only sees its own part of a request. When students' pages hang while the server
answers in milliseconds, the delay is between the device and the server; these reports show
where. Guests may report too: their rows have no user.
"""
import logging
from typing import List, Literal, Optional

from fastapi import Depends, FastAPI, Request
from pydantic import BaseModel, Field
from slowapi import Limiter

from database import Database
from dependencies import get_db, optional_internal_identity

logger = logging.getLogger(__name__)

MAX_REPORTS_PER_BATCH = 20
_MS = dict(ge=0, le=600_000)


class TimingDetails(BaseModel):
    """Everything kept only for reading later; bounded so a client cannot store much."""

    total_ms: Optional[int] = Field(default=None, **_MS)
    queued_ms: Optional[int] = Field(default=None, **_MS)
    dns_ms: Optional[int] = Field(default=None, **_MS)
    connect_ms: Optional[int] = Field(default=None, **_MS)
    tls_ms: Optional[int] = Field(default=None, **_MS)
    download_ms: Optional[int] = Field(default=None, **_MS)
    reused_connection: Optional[bool] = None
    protocol: Optional[str] = Field(default=None, max_length=16)
    proxy_cold: Optional[bool] = None
    api_cold: Optional[bool] = None
    rtt_ms: Optional[int] = Field(default=None, **_MS)
    downlink_mbps: Optional[float] = Field(default=None, ge=0, le=10_000)
    save_data: Optional[bool] = None
    online: Optional[bool] = None
    user_agent: Optional[str] = Field(default=None, max_length=300)


class TimingReport(BaseModel):
    kind: Literal["slow", "failed", "sample"]
    method: str = Field(min_length=1, max_length=8, pattern=r"^[A-Z]+$")
    path: str = Field(min_length=1, max_length=160)
    page: str = Field(min_length=1, max_length=160)
    status: Optional[int] = Field(default=None, ge=0, le=999)
    error: Optional[Literal["network", "aborted"]] = None
    duration_ms: int = Field(**_MS)
    ttfb_ms: Optional[int] = Field(default=None, **_MS)
    proxy_ms: Optional[int] = Field(default=None, **_MS)
    api_ms: Optional[int] = Field(default=None, **_MS)
    app_ms: Optional[int] = Field(default=None, **_MS)
    was_hidden: bool = False
    effective_type: Optional[str] = Field(default=None, max_length=16)
    started_at: Optional[str] = Field(default=None, max_length=32)
    details: TimingDetails = Field(default_factory=TimingDetails)


class TimingBatch(BaseModel):
    tab_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    reports: List[TimingReport] = Field(min_length=1, max_length=MAX_REPORTS_PER_BATCH)


def setup_client_timings_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.post("/api/client-timings")
    @limiter.limit("30/minute")
    async def record_client_timings(
        request: Request,
        payload: TimingBatch,
        current_user: Optional[dict] = Depends(optional_internal_identity),
        db: Database = Depends(get_db),
    ):
        user_id = int(current_user["id"]) if current_user else None
        reports = [
            report.model_dump(exclude={"details"}) | {"details": report.details.model_dump(exclude_none=True)}
            for report in payload.reports
        ]
        recorded = await db.client_timings.record(user_id, payload.tab_id, reports)
        return {"recorded": recorded}
