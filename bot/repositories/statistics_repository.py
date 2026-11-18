"""
Admin statistics: period-scoped learning analytics for the /admin/statistics workspace.

PostgreSQL only. Timestamps are stored as UTC text ("YYYY-MM-DD HH24:MI:SS"), so range
filters compare text and local days come from casting to timestamp and adding the viewer's
UTC offset. SQL filters, groups and counts; ratios, zero-filled series and distinct users
across days are computed in Python.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from statistics import median
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import storage as db_driver

from .base import BaseRepository

PERIOD_DAYS: Dict[str, Optional[int]] = {"7d": 7, "30d": 30, "90d": 90, "all": None}
DEFAULT_TZ_OFFSET_MINUTES = 300  # Kazakhstan (UTC+5), used when the browser sends no offset.
MIN_TZ_OFFSET_MINUTES = -720
MAX_TZ_OFFSET_MINUTES = 840

# A task is "hard" once enough answers show that most of them are wrong.
HARD_TASK_MIN_ATTEMPTS = 5
HARD_TASK_MAX_ACCURACY = 0.4
# Presence heartbeats refresh users.last_active about once a minute.
ONLINE_WINDOW_SECONDS = 120

STUDENT_LIMIT = 2000
TASK_LIMIT = 1000
TOPIC_LIMIT = 30
RECENT_LIMIT = 20
DAILY_SERIES_MAX_DAYS = 92
WEEKLY_SERIES_MAX_DAYS = 735
ACTIVE_DAY_BUCKETS: Tuple[Tuple[str, int, Optional[int]], ...] = (("1", 1, 1), ("2-3", 2, 3), ("4-7", 4, 7), ("8+", 8, None))
ACHIEVEMENT_NAMES: Dict[str, str] = {
    "first_solve": "Бірінші есеп",
    "ten_solves": "Ондық",
    "fifty_solves": "Елудік",
    "hundred_solves": "Жүздік",
    "streak_7": "Қатарынан апта",
    "streak_30": "Қатарынан ай",
}

_TS = "%Y-%m-%d %H:%M:%S"
# Lower bound for "all time": keeps one query shape and guards the timestamp casts.
_EPOCH = "1970-01-01 00:00:00"


@dataclass(frozen=True)
class StatsWindow:
    """A reporting period measured in the viewer's local days, with its UTC bounds."""

    key: str
    days: Optional[int]
    tz_offset_minutes: int
    now: datetime  # naive UTC
    today: date
    start: Optional[date]  # first local day of the period; None means all time
    previous_start: Optional[date]

    def utc(self, local_day: date) -> str:
        """UTC text of the local midnight that starts `local_day`."""
        return (datetime.combine(local_day, time.min) - timedelta(minutes=self.tz_offset_minutes)).strftime(_TS)

    @property
    def start_utc(self) -> str:
        return self.utc(self.start) if self.start else _EPOCH

    @property
    def previous_start_utc(self) -> str:
        """Start of the comparison period; all time has none, so it starts at the epoch too."""
        return self.utc(self.previous_start) if self.previous_start else _EPOCH

    @property
    def end_utc(self) -> str:
        """Exclusive upper bound: the local midnight that ends today."""
        return self.utc(self.today + timedelta(days=1))

    @property
    def previous_end(self) -> Optional[date]:
        return self.start - timedelta(days=1) if self.start else None

    def local(self, column: str) -> str:
        """SQL for a stored UTC text timestamp as a timestamp in the viewer's zone.

        Text that does not start like a date (an empty string, a legacy epoch number) becomes
        NULL instead of failing the cast, so one bad row cannot take the whole page down.
        """
        return (f"(CASE WHEN {column} ~ '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}' THEN {column}::timestamp END"
                f" + interval '{self.tz_offset_minutes} minutes')")

    def local_day(self, column: str) -> str:
        return f"{self.local(column)}::date"

    def describe(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "days": self.days,
            "start": self.start.isoformat() if self.start else None,
            "end": self.today.isoformat(),
            "previous_start": self.previous_start.isoformat() if self.previous_start else None,
            "previous_end": self.previous_end.isoformat() if self.previous_end else None,
            "tz_offset_minutes": self.tz_offset_minutes,
        }


def build_window(period: str, tz_offset_minutes: int = DEFAULT_TZ_OFFSET_MINUTES,
                 now: Optional[datetime] = None) -> StatsWindow:
    """The last N local days including today, plus the N days before them for comparison."""
    if period not in PERIOD_DAYS:
        raise ValueError(f"Unsupported period '{period}'")
    offset = max(MIN_TZ_OFFSET_MINUTES, min(MAX_TZ_OFFSET_MINUTES, int(tz_offset_minutes)))
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is not None:
        current = current.astimezone(timezone.utc).replace(tzinfo=None)
    today = (current + timedelta(minutes=offset)).date()
    days = PERIOD_DAYS[period]
    start = today - timedelta(days=days - 1) if days else None
    previous_start = start - timedelta(days=days) if days and start else None
    return StatsWindow(key=period, days=days, tz_offset_minutes=offset, now=current, today=today,
                       start=start, previous_start=previous_start)


def _iso(value: Any) -> Optional[str]:
    """Stored UTC text as an ISO instant the browser parses without guessing the zone."""
    text = str(value or "").strip()
    if not text:
        return None
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is not None:
        moment = moment.astimezone(timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def _int(value: Any) -> int:
    return int(value or 0)


def _ratio(part: float, whole: float) -> Optional[float]:
    return round(part / whole, 4) if whole else None


def _preview(value: Optional[str], limit: int = 160) -> str:
    text = " ".join((value or "").split())
    return text if len(text) <= limit else f"{text[:limit]}..."


def _draft_answer_has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, list):
        return any(_draft_answer_has_value(item) for item in value)
    if isinstance(value, dict):
        return any(_draft_answer_has_value(item) for item in value.values())
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return False
        if trimmed[0] in "[{":
            try:
                parsed = json.loads(trimmed)
            except ValueError:
                return True
            if isinstance(parsed, (list, dict)):
                return _draft_answer_has_value(parsed)
        return True
    return bool(str(value).strip())


def count_draft_answers(raw_answers: Any) -> int:
    """Count non-empty task answers inside a serialized trial_test_drafts payload."""
    if not raw_answers:
        return 0
    try:
        parsed = json.loads(raw_answers) if isinstance(raw_answers, str) else raw_answers
    except (TypeError, ValueError):
        return 0
    if not isinstance(parsed, dict):
        return 0
    return sum(1 for value in parsed.values() if _draft_answer_has_value(value))


_STATIC_VISIT_LABELS: Dict[str, str] = {
    "/": "Кіру беті",
    "/modules": "Модуль картасы",
    "/trial-test": "Сынақ тесттері",
    "/trial-test/history": "Тест өту тарихы",
    "/quizzes": "Квиздер каталогы",
    "/quizzes/create": "Квиз құру",
    "/join": "Квизге қосылу",
    "/quiz/history": "Квиз тарихы",
    "/profile": "Профиль",
    "/profile/export": "Деректер экспорты",
    "/achievements": "Жетістіктер",
}


def parse_visit_route(path: Optional[str]) -> Tuple[str, Optional[Tuple[str, int]]]:
    """Return a default Kazakh label and optional (entity_kind, entity_id) for title lookup."""
    if not path:
        return "—", None
    parts = [part for part in path.strip().split("/") if part]
    if not parts:
        return _STATIC_VISIT_LABELS["/"], None
    if path in _STATIC_VISIT_LABELS:
        return _STATIC_VISIT_LABELS[path], None

    def _pos_int(raw: str) -> Optional[int]:
        return int(raw) if raw.isdigit() and int(raw) > 0 else None

    if parts[0] == "modules" and len(parts) == 2 and (entity_id := _pos_int(parts[1])):
        return f"Модуль #{entity_id}", ("module", entity_id)
    if parts[0] == "lessons" and len(parts) >= 2 and (entity_id := _pos_int(parts[1])):
        if len(parts) >= 4 and parts[2] == "review":
            return f"Қателер талдауы · Сабақ #{entity_id}", ("lesson", entity_id)
        return f"Сабақ #{entity_id}", ("lesson", entity_id)
    if parts[0] == "trial-test" and len(parts) >= 2 and (entity_id := _pos_int(parts[1])):
        if len(parts) >= 3 and parts[2] == "results":
            return f"Тест нәтижесі #{entity_id}", ("trial_test", entity_id)
        return f"Сынақ тесті #{entity_id}", ("trial_test", entity_id)
    if parts[0] == "quizzes" and len(parts) >= 2 and (entity_id := _pos_int(parts[1])):
        return f"Квиз #{entity_id}", ("quiz", entity_id)
    if parts[0] == "quiz" and len(parts) >= 3 and (entity_id := _pos_int(parts[2])):
        if parts[1] == "play":
            return f"Квиз ойыны #{entity_id}", None
        if parts[1] == "review":
            return f"Квиз талдауы #{entity_id}", None
        if parts[1] == "host":
            return f"Квиз жүргізу #{entity_id}", None
    if parts[0] == "profile" and len(parts) == 2 and (entity_id := _pos_int(parts[1])):
        return f"Оқушы профилі #{entity_id}", None
    if parts[0] == "admin":
        return "Әкімші панелі", None
    return path, None


def _without_admins(column: str, exclude_admins: bool) -> str:
    return f" AND {column} NOT IN (SELECT id FROM users WHERE is_admin = 1)" if exclude_admins else ""


def bucket_plan(first: date, last: date) -> Tuple[str, List[Tuple[date, date]]]:
    """Daily buckets for short spans, calendar weeks then months for longer ones."""
    if last < first:
        first = last
    span = (last - first).days + 1
    buckets: List[Tuple[date, date]] = []
    cursor = first
    if span <= DAILY_SERIES_MAX_DAYS:
        while cursor <= last:
            buckets.append((cursor, cursor))
            cursor += timedelta(days=1)
        return "day", buckets
    if span <= WEEKLY_SERIES_MAX_DAYS:
        while cursor <= last:
            end = min(cursor + timedelta(days=6 - cursor.weekday()), last)
            buckets.append((cursor, end))
            cursor = end + timedelta(days=1)
        return "week", buckets
    while cursor <= last:
        next_month = date(cursor.year + cursor.month // 12, cursor.month % 12 + 1, 1)
        end = min(next_month - timedelta(days=1), last)
        buckets.append((cursor, end))
        cursor = end + timedelta(days=1)
    return "month", buckets


def effective_streak(streak: Any, last_streak_date: Any, today: date) -> int:
    """A stored streak only counts while its last day is today or yesterday."""
    try:
        last = date.fromisoformat(str(last_streak_date)[:10])
    except (TypeError, ValueError):
        return 0
    return _int(streak) if (today - last).days <= 1 else 0


@dataclass
class _Totals:
    attempts: int = 0
    correct: int = 0
    trials: int = 0
    trial_score: float = 0.0
    reviews: int = 0
    users: Set[int] = field(default_factory=set)
    per_user: Dict[int, Dict[str, float]] = field(default_factory=dict)

    @property
    def accuracy(self) -> Optional[float]:
        return _ratio(self.correct, self.attempts)

    @property
    def trial_average(self) -> Optional[float]:
        return _ratio(self.trial_score, self.trials * 100)


class _Activity:
    """Learning events per local day and user: answers, trial tests and review answers."""

    METRICS = ("attempts", "correct", "trials", "trial_score", "reviews")

    def __init__(self) -> None:
        self.days: Dict[date, Dict[int, Dict[str, float]]] = {}

    def add(self, day: date, user_id: int, **amounts: float) -> None:
        cell = self.days.setdefault(day, {}).setdefault(int(user_id), dict.fromkeys(self.METRICS, 0))
        for metric, amount in amounts.items():
            cell[metric] += amount or 0

    def first_day(self) -> Optional[date]:
        return min(self.days) if self.days else None

    def totals(self, first: Optional[date], last: date) -> _Totals:
        result = _Totals()
        for day, users in self.days.items():
            if day > last or (first is not None and day < first):
                continue
            for user_id, cell in users.items():
                result.attempts += int(cell["attempts"])
                result.correct += int(cell["correct"])
                result.trials += int(cell["trials"])
                result.trial_score += cell["trial_score"]
                result.reviews += int(cell["reviews"])
                result.users.add(user_id)
                user = result.per_user.setdefault(user_id, {**dict.fromkeys(self.METRICS, 0), "active_days": 0})
                for metric in self.METRICS:
                    user[metric] += cell[metric]
                user["active_days"] += 1
        return result


class StatisticsRepository(BaseRepository):
    """Read-only analytics queries for the admin statistics workspace."""

    @staticmethod
    async def _rows(db: db_driver.Connection, sql: str, params: Iterable[Any] = ()) -> List[Tuple[Any, ...]]:
        # A pooled connection may still carry another repository's row factory; plain tuples keep
        # positional access, unpacking and sorting the same either way.
        async with db.execute(sql, tuple(params)) as cursor:
            return [tuple(row) for row in await cursor.fetchall()]

    async def _load_activity(self, db: db_driver.Connection, window: StatsWindow, exclude_admins: bool) -> _Activity:
        """Events from the start of the comparison period (or all time) grouped by local day and user."""
        admins = _without_admins("user_id", exclude_admins)
        bounds = [window.previous_start_utc, window.end_utc]
        activity = _Activity()
        for row in await self._rows(db, f"""
            SELECT e.day, e.user_id,
                   COUNT(*) FILTER (WHERE e.kind = 'answer'),
                   COUNT(*) FILTER (WHERE e.kind = 'answer' AND e.correct = 1),
                   COUNT(*) FILTER (WHERE e.kind = 'trial'),
                   COALESCE(SUM(e.percentage) FILTER (WHERE e.kind = 'trial'), 0),
                   COUNT(*) FILTER (WHERE e.kind = 'review')
            FROM (
                SELECT 'answer' AS kind, user_id, {window.local_day("created_at")} AS day,
                       is_correct::int AS correct, 0::double precision AS percentage
                FROM solutions
                WHERE created_at >= ? AND created_at < ?{admins}
                UNION ALL
                SELECT 'trial', user_id, {window.local_day("completed_at")}, 0, percentage
                FROM trial_test_results
                WHERE completed_at >= ? AND completed_at < ?{admins}
                UNION ALL
                SELECT 'review', user_id, {window.local_day("created_at")}, 0, 0
                FROM module_review_attempts
                WHERE created_at >= ? AND created_at < ?{admins}
            ) e
            GROUP BY e.day, e.user_id
        """, bounds * 3):
            activity.add(row[0], row[1], attempts=_int(row[2]), correct=_int(row[3]), trials=_int(row[4]),
                         trial_score=float(row[5] or 0), reviews=_int(row[6]))
        return activity

    async def _load_registrations(self, db: db_driver.Connection, window: StatsWindow,
                                  exclude_admins: bool) -> Dict[date, int]:
        rows = await self._rows(db, f"""
            SELECT {window.local_day("created_at")} AS day, COUNT(*)
            FROM users
            WHERE created_at >= ? AND created_at < ?{" AND is_admin = 0" if exclude_admins else ""}
            GROUP BY 1
        """, (window.previous_start_utc, window.end_utc))
        return {row[0]: _int(row[1]) for row in rows if row[0] is not None}

    async def _load_mini_progress(
        self, db: db_driver.Connection, exclude_admins: bool,
    ) -> Tuple[Dict[int, int], Dict[int, Dict[int, int]]]:
        """Active task counts per mini-lesson and each student's completed tasks in them."""
        totals = {
            int(row[0]): _int(row[1])
            for row in await self._rows(db, """
                SELECT mini_lesson_id, COUNT(*) FROM tasks
                WHERE deleted_at IS NULL AND mini_lesson_id IS NOT NULL
                GROUP BY mini_lesson_id
            """)
        }
        completed: Dict[int, Dict[int, int]] = {}
        for row in await self._rows(db, f"""
            SELECT up.user_id, t.mini_lesson_id, COUNT(*)
            FROM user_progress up
            JOIN tasks t ON t.id = up.task_id
            WHERE up.status = 'completed' AND t.deleted_at IS NULL AND t.mini_lesson_id IS NOT NULL
                  {_without_admins("up.user_id", exclude_admins)}
            GROUP BY up.user_id, t.mini_lesson_id
        """):
            completed.setdefault(int(row[0]), {})[int(row[1])] = _int(row[2])
        return totals, completed

    def _series(self, window: StatsWindow, activity: _Activity, registrations: Dict[date, int]) -> Dict[str, Any]:
        first = window.start
        if first is None:
            known = [day for day in (activity.first_day(), min(registrations) if registrations else None) if day]
            first = min(known) if known else window.today - timedelta(days=29)
        granularity, buckets = bucket_plan(first, window.today)
        points = []
        for start, end in buckets:
            totals = activity.totals(start, end)
            points.append({
                "start": start.isoformat(),
                "end": end.isoformat(),
                "attempts": totals.attempts,
                "correct": totals.correct,
                "active_users": len(totals.users),
                "new_users": sum(count for day, count in registrations.items() if start <= day <= end),
                "trial_attempts": totals.trials,
                "trial_average": totals.trial_average,
            })
        return {"granularity": granularity, "points": points}

    @staticmethod
    def _kpi(window: StatsWindow, value: Any, previous: Any) -> Dict[str, Any]:
        return {"value": value, "previous": previous if window.days else None}

    async def get_overview(self, window: StatsWindow, *, exclude_admins: bool = False) -> Dict[str, Any]:
        online_since = (window.now - timedelta(seconds=ONLINE_WINDOW_SECONDS)).strftime(_TS)
        answers_admins = _without_admins("user_id", exclude_admins)
        users_admins = " AND is_admin = 0" if exclude_admins else ""
        current_bounds = (window.start_utc, window.end_utc)
        async with self._connection() as db:
            activity = await self._load_activity(db, window, exclude_admins)
            registrations = await self._load_registrations(db, window, exclude_admins)
            mini_totals, completed = await self._load_mini_progress(db, exclude_admins)
            heatmap_rows = await self._rows(db, f"""
                SELECT extract(isodow FROM e.local_ts)::int, extract(hour FROM e.local_ts)::int, COUNT(*)
                FROM (
                    SELECT {window.local("created_at")} AS local_ts
                    FROM solutions
                    WHERE created_at >= ? AND created_at < ?{answers_admins}
                ) e
                GROUP BY 1, 2
            """, current_bounds)
            hard_tasks = _int((await self._rows(db, f"""
                SELECT COUNT(*) FROM (
                    SELECT task_id FROM solutions
                    WHERE created_at >= ? AND created_at < ?{answers_admins}
                    GROUP BY task_id
                    HAVING COUNT(*) >= ? AND COUNT(*) FILTER (WHERE is_correct = 1) < ? * COUNT(*)
                ) hard
            """, (*current_bounds, HARD_TASK_MIN_ATTEMPTS, HARD_TASK_MAX_ACCURACY)))[0][0])
            cohort = {
                int(row[0]) for row in await self._rows(db, f"""
                    SELECT id FROM users WHERE created_at >= ? AND created_at < ?{users_admins}
                """, current_bounds)
            }
            totals_row = (await self._rows(db, f"""
                SELECT
                    (SELECT COUNT(*) FROM users WHERE TRUE{users_admins}),
                    (SELECT COUNT(*) FROM modules),
                    (SELECT COUNT(*) FROM lessons),
                    (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL),
                    (SELECT COUNT(*) FROM bank_tasks WHERE deleted_at IS NULL
                        AND id NOT IN (SELECT twin_bank_task_id FROM bank_task_twins)),
                    (SELECT COUNT(*) FROM trial_tests),
                    (SELECT COUNT(*) FROM quizzes),
                    (SELECT COUNT(*) FROM reports WHERE status = 'pending'),
                    (SELECT COUNT(*) FROM trial_test_reports WHERE status = 'pending'),
                    (SELECT COUNT(*) FROM users WHERE last_active >= ?{users_admins})
            """, (online_since,)))[0]

        current = activity.totals(window.start, window.today)
        previous = activity.totals(window.previous_start, window.previous_end) if window.days else _Totals()
        new_users = sum(count for day, count in registrations.items() if window.start is None or day >= window.start)
        previous_new_users = sum(
            count for day, count in registrations.items()
            if window.previous_start and window.previous_start <= day <= window.previous_end
        )
        finished_mini = {
            user_id for user_id, minis in completed.items()
            if any(mini_totals.get(mini_id) and done >= mini_totals[mini_id] for mini_id, done in minis.items())
        }
        # Everything a student registered in the period ever did falls inside the period.
        cohort_activity = {user_id: current.per_user.get(user_id) for user_id in cohort}
        journey = [
            {"key": "registered", "count": len(cohort)},
            {"key": "answered", "count": sum(1 for cell in cohort_activity.values() if cell and cell["attempts"] > 0)},
            {"key": "completed_mini_lesson", "count": len(cohort & finished_mini)},
            {"key": "returned", "count": sum(1 for cell in cohort_activity.values() if cell and cell["active_days"] >= 2)},
            {"key": "trial_test", "count": sum(1 for cell in cohort_activity.values() if cell and cell["trials"] > 0)},
        ]
        today_totals = activity.totals(window.today, window.today)
        return {
            "period": window.describe(),
            "kpis": {
                "active_users": self._kpi(window, len(current.users), len(previous.users)),
                "new_users": self._kpi(window, new_users, previous_new_users),
                "attempts": self._kpi(window, current.attempts, previous.attempts),
                "accuracy": self._kpi(window, current.accuracy, previous.accuracy),
                "trial_attempts": self._kpi(window, current.trials, previous.trials),
                "trial_average": self._kpi(window, current.trial_average, previous.trial_average),
            },
            "series": self._series(window, activity, registrations),
            # ISO weekday 1 (Monday) .. 7 becomes 0 .. 6.
            "heatmap": [
                {"weekday": _int(row[0]) - 1, "hour": _int(row[1]), "count": _int(row[2])}
                for row in sorted(heatmap_rows)
            ],
            "journey": journey,
            "attention": {
                "pending_reports": _int(totals_row[7]) + _int(totals_row[8]),
                "hard_tasks": hard_tasks,
                "churned_students": len(previous.users - current.users) if window.days else 0,
                "silent_new_students": sum(1 for cell in cohort_activity.values() if not cell),
            },
            "today": {
                "online_now": _int(totals_row[9]),
                "active_users": len(today_totals.users),
                "attempts": today_totals.attempts,
                "new_users": registrations.get(window.today, 0),
            },
            "totals": {
                "users": _int(totals_row[0]),
                "modules": _int(totals_row[1]),
                "lessons": _int(totals_row[2]),
                "module_tasks": _int(totals_row[3]),
                "bank_tasks": _int(totals_row[4]),
                "trial_tests": _int(totals_row[5]),
                "quizzes": _int(totals_row[6]),
            },
            "thresholds": {"hard_task_min_attempts": HARD_TASK_MIN_ATTEMPTS, "hard_task_max_accuracy": HARD_TASK_MAX_ACCURACY},
        }

    async def get_students(self, window: StatsWindow, *, exclude_admins: bool = False,
                           include_email: bool = False) -> Dict[str, Any]:
        async with self._connection() as db:
            track_pages = await self._has_page_visit_tracking(db)
            activity = await self._load_activity(db, window, exclude_admins)
            registrations = await self._load_registrations(db, window, exclude_admins)
            last_seen_path_col = "last_seen_path" if track_pages else "NULL"
            user_rows = await self._rows(db, f"""
                SELECT id, nickname, email, created_at, last_active, total_solved, streak, last_streak_date,
                       is_admin, {window.local_day("created_at")}, {last_seen_path_col}
                FROM users
                WHERE TRUE{" AND is_admin = 0" if exclude_admins else ""}
            """)
            ever_active = {
                int(row[0]) for row in await self._rows(db, """
                    SELECT user_id FROM solutions
                    UNION SELECT user_id FROM trial_test_results
                    UNION SELECT user_id FROM module_review_attempts
                """)
            }
            achievement_rows = await self._rows(db, f"""
                SELECT achievement_id, COUNT(*) FROM user_achievements
                WHERE TRUE{_without_admins("user_id", exclude_admins)}
                GROUP BY achievement_id
            """)
            quiz_rows = await self._rows(db, f"""
                SELECT qp.user_id,
                       COUNT(DISTINCT qp.session_id),
                       COALESCE(SUM(qa.answers), 0),
                       COALESCE(SUM(qa.correct), 0)
                FROM quiz_participants qp
                JOIN quiz_sessions s ON s.id = qp.session_id
                LEFT JOIN (
                    SELECT session_id, participant_id,
                           COUNT(*) AS answers,
                           COUNT(*) FILTER (WHERE is_correct = 1) AS correct
                    FROM quiz_answers
                    GROUP BY session_id, participant_id
                ) qa ON qa.session_id = qp.session_id AND qa.participant_id = qp.id
                WHERE qp.user_id IS NOT NULL
                  AND s.created_at >= ? AND s.created_at < ?{_without_admins("qp.user_id", exclude_admins)}
                GROUP BY qp.user_id
            """, (window.start_utc, window.end_utc))
            ever_quiz = {
                int(row[0]) for row in await self._rows(db, f"""
                    SELECT DISTINCT user_id FROM quiz_participants
                    WHERE user_id IS NOT NULL{_without_admins("user_id", exclude_admins)}
                """)
            }
            draft_rows = await self._rows(db, f"""
                SELECT user_id, answers, current_task_index
                FROM trial_test_drafts
                WHERE TRUE{_without_admins("user_id", exclude_admins)}
            """)
            visit_rows = await self._rows(db, f"""
                SELECT user_id, COUNT(*)
                FROM user_page_visits
                WHERE visited_at >= ? AND visited_at < ?{_without_admins("user_id", exclude_admins)}
                GROUP BY user_id
            """, (window.start_utc, window.end_utc)) if track_pages else []

        visits_by_user: Dict[int, int] = {int(row[0]): _int(row[1]) for row in visit_rows}
        quiz_by_user: Dict[int, Dict[str, int]] = {
            int(row[0]): {"sessions": _int(row[1]), "answers": _int(row[2]), "correct": _int(row[3])}
            for row in quiz_rows
        }
        drafts_by_user: Dict[int, Dict[str, int]] = {}
        for row in draft_rows:
            uid = int(row[0])
            answer_count = count_draft_answers(row[1])
            if answer_count > 0 or _int(row[2]) > 0:
                entry = drafts_by_user.setdefault(uid, {"count": 0, "answers": 0})
                entry["count"] += 1
                entry["answers"] += answer_count

        current = activity.totals(window.start, window.today)
        previous = activity.totals(window.previous_start, window.previous_end) if window.days else _Totals()
        utc_today = window.now.date()

        students = []
        for row in user_rows:
            user_id = int(row[0])
            cell = current.per_user.get(user_id)
            attempts = int(cell["attempts"]) if cell else 0
            trials = int(cell["trials"]) if cell else 0
            quiz_cell = quiz_by_user.get(user_id)
            quiz_sessions = quiz_cell["sessions"] if quiz_cell else 0
            quiz_answers = quiz_cell["answers"] if quiz_cell else 0
            quiz_correct = quiz_cell["correct"] if quiz_cell else 0
            draft_cell = drafts_by_user.get(user_id)
            student = {
                "user_id": user_id,
                "nickname": row[1],
                "registered_at": _iso(row[3]),
                "last_seen_at": _iso(row[4]),
                "last_seen_path": row[10],
                "page_visits": visits_by_user.get(user_id, 0),
                "attempts": attempts,
                "correct": int(cell["correct"]) if cell else 0,
                "accuracy": _ratio(cell["correct"], attempts) if cell else None,
                "active_days": int(cell["active_days"]) if cell else 0,
                "trial_attempts": trials,
                "trial_average": _ratio(cell["trial_score"], trials * 100) if cell else None,
                "trial_drafts": draft_cell["count"] if draft_cell else 0,
                "trial_draft_answers": draft_cell["answers"] if draft_cell else 0,
                "quiz_sessions": quiz_sessions,
                "quiz_answers": quiz_answers,
                "quiz_correct": quiz_correct,
                "quiz_accuracy": _ratio(quiz_correct, quiz_answers),
                "has_quiz_history": user_id in ever_quiz,
                "total_solved": _int(row[5]),
                "streak": effective_streak(row[6], row[7], utc_today),
                "is_admin": bool(row[8]),
                "is_active": cell is not None,
                "is_new": row[9] is not None and (window.start is None or row[9] >= window.start),
                "is_churned": bool(window.days) and cell is None and user_id in previous.users,
                "never_active": user_id not in ever_active,
            }
            if include_email:
                student["email"] = row[2]
            students.append(student)

        # Most active first; the rest by who was seen most recently.
        students.sort(key=lambda item: item["last_seen_at"] or "", reverse=True)
        students.sort(key=lambda item: (not item["is_active"], -item["attempts"], -item["trial_attempts"]))

        active = [item for item in students if item["is_active"]]
        active_days = [item["active_days"] for item in active]
        achievement_counts = {str(row[0]): _int(row[1]) for row in achievement_rows}
        achievements = [
            {"id": key, "name": name, "count": achievement_counts.get(key, 0)}
            for key, name in ACHIEVEMENT_NAMES.items()
        ] + [
            {"id": key, "name": key, "count": count}
            for key, count in sorted(achievement_counts.items()) if key not in ACHIEVEMENT_NAMES
        ]
        return {
            "period": window.describe(),
            "summary": {
                "total": len(students),
                "active": len(active),
                "new": sum(1 for item in students if item["is_new"]),
                "returning": len(current.users & previous.users) if window.days else None,
                "churned": sum(1 for item in students if item["is_churned"]) if window.days else None,
                "never_active": sum(1 for item in students if item["never_active"]),
                "average_active_days": round(sum(active_days) / len(active_days), 1) if active_days else None,
                "median_attempts": median([item["attempts"] for item in active]) if active else None,
            },
            "series": self._series(window, activity, registrations),
            "activity_distribution": [
                {"key": key, "count": sum(1 for days in active_days if days >= low and (high is None or days <= high))}
                for key, low, high in ACTIVE_DAY_BUCKETS
            ],
            "achievements": achievements,
            "students": students[:STUDENT_LIMIT],
            "truncated": len(students) > STUDENT_LIMIT,
            "emails_visible": include_email,
        }

    async def _resolve_visit_labels(self, db: db_driver.Connection, paths: Iterable[str]) -> Dict[str, str]:
        parsed = {path: parse_visit_route(path) for path in paths}
        ids_by_kind: Dict[str, Set[int]] = {}
        for _, entity in parsed.values():
            if entity is not None:
                ids_by_kind.setdefault(entity[0], set()).add(entity[1])

        table_queries = {
            "module": ("modules", "name", "Модуль"),
            "lesson": ("lessons", "title", "Сабақ"),
            "trial_test": ("trial_tests", "title", "Тест"),
            "quiz": ("quizzes", "title", "Квиз"),
        }
        names: Dict[Tuple[str, int], str] = {}
        for kind, ids in ids_by_kind.items():
            table, col, _ = table_queries[kind]
            placeholders = ",".join("?" for _ in ids)
            for row in await self._rows(db, f"SELECT id, {col} FROM {table} WHERE id IN ({placeholders})", tuple(sorted(ids))):
                if row[1]:
                    names[(kind, int(row[0]))] = str(row[1])

        labels: Dict[str, str] = {}
        for path, (default_label, entity) in parsed.items():
            if entity is not None and entity in names:
                kind, _ = entity
                prefix = table_queries[kind][2]
                if kind == "lesson" and "/review/" in path:
                    labels[path] = f"Қателер талдауы · {names[entity]}"
                elif kind == "trial_test" and path.endswith("/results"):
                    labels[path] = f"Тест нәтижесі: {names[entity]}"
                else:
                    labels[path] = f"{prefix}: {names[entity]}"
            else:
                labels[path] = default_label
        return labels

    async def get_student_activity(
        self, user_id: int, *, include_email: bool = False, limit: int = 40,
    ) -> Optional[Dict[str, Any]]:
        """Recent page visits, unfinished trial-test drafts, and quiz sessions for one student."""
        async with self._connection() as db:
            track_pages = await self._has_page_visit_tracking(db)
            last_seen_path_col = "last_seen_path" if track_pages else "NULL"
            user_rows = await self._rows(
                db,
                f"SELECT id, nickname, email, last_active, {last_seen_path_col} FROM users WHERE id = ?",
                (user_id,),
            )
            if not user_rows:
                return None
            user_row = user_rows[0]

            visit_rows = await self._rows(
                db,
                "SELECT id, path, visited_at FROM user_page_visits WHERE user_id = ? ORDER BY id DESC LIMIT ?",
                (user_id, limit),
            ) if track_pages else []

            draft_rows = await self._rows(
                db,
                """SELECT d.trial_test_id, tt.title, d.answers, d.current_task_index, d.updated_at
                   FROM trial_test_drafts d
                   LEFT JOIN trial_tests tt ON tt.id = d.trial_test_id
                   WHERE d.user_id = ?
                   ORDER BY d.updated_at DESC""",
                (user_id,),
            )
            quiz_rows = await self._rows(
                db,
                """SELECT qp.session_id, q.title, qp.joined_at, qp.is_finished,
                          COUNT(qa.id), COALESCE(SUM(qa.is_correct), 0)
                   FROM quiz_participants qp
                   JOIN quiz_sessions s ON s.id = qp.session_id
                   JOIN quizzes q ON q.id = s.quiz_id
                   LEFT JOIN quiz_answers qa ON qa.session_id = qp.session_id AND qa.participant_id = qp.id
                   WHERE qp.user_id = ?
                   GROUP BY qp.id, qp.session_id, q.title, qp.joined_at, qp.is_finished
                   ORDER BY qp.id DESC
                   LIMIT 20""",
                (user_id,),
            )

            all_paths = {str(row[1]) for row in visit_rows if row[1]}
            if user_row[4]:
                all_paths.add(str(user_row[4]))
            labels = await self._resolve_visit_labels(db, all_paths) if all_paths else {}

        drafts = []
        for row in draft_rows:
            answer_count = count_draft_answers(row[2])
            task_idx = _int(row[3])
            if answer_count > 0 or task_idx > 0:
                drafts.append({
                    "trial_test_id": int(row[0]),
                    "title": row[1] or f"Тест #{int(row[0])}",
                    "answers_count": answer_count,
                    "current_task_index": task_idx,
                    "updated_at": _iso(row[4]),
                })

        last_seen_path = str(user_row[4]) if user_row[4] else None
        payload: Dict[str, Any] = {
            "user_id": int(user_row[0]),
            "nickname": user_row[1],
            "last_seen_at": _iso(user_row[3]),
            "last_seen_path": last_seen_path,
            "last_seen_label": labels.get(last_seen_path) if last_seen_path else None,
            "visit_tracking_enabled": track_pages,
            "visits": [
                {
                    "id": int(row[0]),
                    "path": str(row[1]),
                    "label": labels.get(str(row[1]), str(row[1])),
                    "visited_at": _iso(row[2]),
                }
                for row in visit_rows
            ],
            "drafts": drafts,
            "quizzes": [
                {
                    "session_id": int(row[0]),
                    "title": row[1],
                    "joined_at": _iso(row[2]),
                    "is_finished": bool(row[3]),
                    "answers": _int(row[4]),
                    "correct": _int(row[5]),
                }
                for row in quiz_rows
            ],
        }
        if include_email:
            payload["email"] = user_row[2]
        return payload

    async def get_tasks(self, window: StatsWindow, *, exclude_admins: bool = False) -> Dict[str, Any]:
        """Answers to module tasks in the period; a first attempt is a student's earliest answer to a task."""
        async with self._connection() as db:
            rows = await self._rows(db, f"""
                WITH answers AS (
                    SELECT s.id, s.task_id, s.user_id, s.is_correct
                    FROM solutions s
                    WHERE s.created_at >= ? AND s.created_at < ?{_without_admins("s.user_id", exclude_admins)}
                ), firsts AS (
                    SELECT DISTINCT ON (user_id, task_id) id
                    FROM solutions
                    ORDER BY user_id, task_id, id
                ), stats AS (
                    SELECT a.task_id,
                           COUNT(*) AS attempts,
                           COUNT(*) FILTER (WHERE a.is_correct = 1) AS correct,
                           COUNT(DISTINCT a.user_id) AS students,
                           COUNT(DISTINCT a.user_id) FILTER (WHERE a.is_correct = 1) AS solved_students,
                           COUNT(f.id) AS first_attempts,
                           COUNT(f.id) FILTER (WHERE a.is_correct = 1) AS first_correct
                    FROM answers a
                    LEFT JOIN firsts f ON f.id = a.id
                    GROUP BY a.task_id
                )
                SELECT st.task_id, st.attempts, st.correct, st.students, st.solved_students,
                       st.first_attempts, st.first_correct,
                       t.bank_task_id, t.deleted_at IS NOT NULL, bt.text, bt.question_type, bt.difficulty,
                       ml.mini_index, l.id, l.title, l.lesson_number, sec.name, m.id, m.name,
                       ARRAY(
                           SELECT topic.name
                           FROM bank_task_topic_map map
                           JOIN bank_topics topic ON topic.id = map.topic_id
                           WHERE map.bank_task_id = t.bank_task_id
                           ORDER BY topic.name_norm
                       ),
                       (SELECT COUNT(*) FROM reports r WHERE r.task_id = st.task_id),
                       (SELECT COUNT(*) FROM reports r WHERE r.task_id = st.task_id AND r.status = 'pending')
                FROM stats st
                JOIN tasks t ON t.id = st.task_id
                LEFT JOIN bank_tasks bt ON bt.id = t.bank_task_id
                LEFT JOIN mini_lessons ml ON ml.id = t.mini_lesson_id
                LEFT JOIN lessons l ON l.id = ml.lesson_id
                LEFT JOIN sections sec ON sec.id = COALESCE(l.section_id, t.section_id)
                LEFT JOIN modules m ON m.id = sec.module_id
                ORDER BY st.attempts DESC, st.task_id ASC
            """, (window.start_utc, window.end_utc))
            counts = (await self._rows(db, f"""
                SELECT
                    (SELECT COUNT(DISTINCT s.user_id) FROM solutions s
                     WHERE s.created_at >= ? AND s.created_at < ?{_without_admins("s.user_id", exclude_admins)}),
                    (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL),
                    (SELECT COUNT(*) FROM reports WHERE status = 'pending')
            """, (window.start_utc, window.end_utc)))[0]

        tasks = []
        for row in rows:
            attempts, correct = _int(row[1]), _int(row[2])
            accuracy = _ratio(correct, attempts)
            tasks.append({
                "task_id": int(row[0]),
                "bank_task_id": int(row[7]) if row[7] is not None else None,
                "deleted": bool(row[8]),
                "text_preview": _preview(row[9], 300),
                "question_type": row[10] or "input",
                "difficulty": row[11],
                "topics": list(row[19] or []),
                "location": {
                    "mini_index": row[12], "lesson_id": row[13], "lesson_title": row[14],
                    "lesson_number": row[15], "section_name": row[16],
                    "module_id": row[17], "module_name": row[18],
                },
                "attempts": attempts,
                "correct": correct,
                "accuracy": accuracy,
                "students": _int(row[3]),
                "solved_students": _int(row[4]),
                "first_attempts": _int(row[5]),
                "first_correct": _int(row[6]),
                "first_accuracy": _ratio(_int(row[6]), _int(row[5])),
                "reports": _int(row[20]),
                "pending_reports": _int(row[21]),
                "is_hard": attempts >= HARD_TASK_MIN_ATTEMPTS and accuracy is not None and accuracy < HARD_TASK_MAX_ACCURACY,
            })

        def breakdown(keys_of) -> List[Dict[str, Any]]:
            groups: Dict[str, Dict[str, Any]] = {}
            for item in tasks:
                for key in keys_of(item):
                    group = groups.setdefault(key, {"key": key, "attempts": 0, "correct": 0, "tasks": 0})
                    group["attempts"] += item["attempts"]
                    group["correct"] += item["correct"]
                    group["tasks"] += 1
            for group in groups.values():
                group["accuracy"] = _ratio(group["correct"], group["attempts"])
            return sorted(groups.values(), key=lambda group: (-group["attempts"], group["key"]))

        total_attempts = sum(item["attempts"] for item in tasks)
        total_first = sum(item["first_attempts"] for item in tasks)
        return {
            "period": window.describe(),
            "summary": {
                "attempts": total_attempts,
                "accuracy": _ratio(sum(item["correct"] for item in tasks), total_attempts),
                "first_attempts": total_first,
                "first_accuracy": _ratio(sum(item["first_correct"] for item in tasks), total_first),
                "students": _int(counts[0]),
                "tasks_attempted": len(tasks),
                "tasks_total": _int(counts[1]),
                "hard_tasks": sum(1 for item in tasks if item["is_hard"]),
                "pending_reports": _int(counts[2]),
            },
            "by_type": breakdown(lambda item: [item["question_type"]]),
            "by_difficulty": sorted(breakdown(lambda item: [item["difficulty"] or ""]), key=lambda group: group["key"]),
            # An empty key collects tasks without a topic.
            "by_topic": breakdown(lambda item: item["topics"] or [""])[:TOPIC_LIMIT],
            "tasks": tasks[:TASK_LIMIT],
            "truncated": len(tasks) > TASK_LIMIT,
            "thresholds": {"hard_task_min_attempts": HARD_TASK_MIN_ATTEMPTS, "hard_task_max_accuracy": HARD_TASK_MAX_ACCURACY},
        }

    async def get_modules(self, window: StatsWindow, *, exclude_admins: bool = False) -> Dict[str, Any]:
        """Progress is the state right now; answers and accuracy belong to the selected period.

        A lesson counts as completed when every mini-lesson that has tasks is fully solved.
        """
        bounds = (window.start_utc, window.end_utc)
        async with self._connection() as db:
            structure = await self._rows(db, """
                SELECT m.id, m.name, sec.name, l.id, l.title, l.lesson_number, ml.id, ml.mini_index
                FROM modules m
                LEFT JOIN sections sec ON sec.module_id = m.id
                LEFT JOIN lessons l ON l.section_id = sec.id
                LEFT JOIN mini_lessons ml ON ml.lesson_id = l.id
                ORDER BY m.sort_order, m.id, sec.sort_order, sec.id,
                         l.sort_order, COALESCE(l.lesson_number, 0), l.id, ml.mini_index, ml.id
            """)
            mini_totals, completed = await self._load_mini_progress(db, exclude_admins)
            answer_rows = await self._rows(db, f"""
                SELECT s.user_id, t.mini_lesson_id,
                       COUNT(*) FILTER (WHERE s.created_at >= ? AND s.created_at < ?),
                       COUNT(*) FILTER (WHERE s.created_at >= ? AND s.created_at < ? AND s.is_correct = 1)
                FROM solutions s
                JOIN tasks t ON t.id = s.task_id
                WHERE t.mini_lesson_id IS NOT NULL{_without_admins("s.user_id", exclude_admins)}
                GROUP BY s.user_id, t.mini_lesson_id
            """, bounds * 2)

        started: Dict[int, Set[int]] = {}
        period: Dict[int, Dict[int, Tuple[int, int]]] = {}
        for user_id, mini_id, attempts, correct in answer_rows:
            started.setdefault(int(mini_id), set()).add(int(user_id))
            if attempts:
                period.setdefault(int(mini_id), {})[int(user_id)] = (_int(attempts), _int(correct))
        for user_id, minis in completed.items():
            for mini_id in minis:
                started.setdefault(mini_id, set()).add(user_id)

        def finished(user_id: int, mini_ids: List[int]) -> bool:
            done = completed.get(user_id, {})
            return bool(mini_ids) and all(done.get(mini_id, 0) >= mini_totals[mini_id] for mini_id in mini_ids)

        def activity_of(mini_ids: List[int]) -> Dict[str, Any]:
            attempts = correct = 0
            users: Set[int] = set()
            for mini_id in mini_ids:
                for user_id, (count, right) in period.get(mini_id, {}).items():
                    attempts += count
                    correct += right
                    users.add(user_id)
            return {"attempts": attempts, "correct": correct, "accuracy": _ratio(correct, attempts),
                    "active_students": len(users)}

        modules: Dict[int, Dict[str, Any]] = {}
        lessons: Dict[int, Dict[str, Any]] = {}
        for module_id, module_name, section_name, lesson_id, title, number, mini_id, mini_index in structure:
            module = modules.setdefault(int(module_id), {"id": int(module_id), "name": module_name, "lessons": []})
            if lesson_id is None:
                continue
            lesson = lessons.get(int(lesson_id))
            if lesson is None:
                lesson = lessons[int(lesson_id)] = {
                    "id": int(lesson_id), "title": title, "lesson_number": number,
                    "section_name": section_name, "minis": [],
                }
                module["lessons"].append(lesson)
            if mini_id is not None:
                lesson["minis"].append({"id": int(mini_id), "mini_index": mini_index})

        all_started: Set[int] = set()
        all_finished_lesson: Set[int] = set()
        for module in modules.values():
            module_minis: List[int] = []
            module_started: Set[int] = set()
            for lesson in module["lessons"]:
                with_tasks = [mini["id"] for mini in lesson["minis"] if mini_totals.get(mini["id"])]
                lesson_started: Set[int] = set()
                for mini_id in with_tasks:
                    lesson_started |= started.get(mini_id, set())
                lesson_finished = {user_id for user_id in lesson_started if finished(user_id, with_tasks)}
                for mini in lesson["minis"]:
                    mini_users = started.get(mini["id"], set()) if mini_totals.get(mini["id"]) else set()
                    mini.update({
                        "tasks": mini_totals.get(mini["id"], 0),
                        "started": len(mini_users),
                        "completed": sum(1 for user_id in mini_users if finished(user_id, [mini["id"]])),
                    })
                lesson.update({
                    "tasks": sum(mini_totals[mini_id] for mini_id in with_tasks),
                    "started": len(lesson_started),
                    "completed": len(lesson_finished),
                    **activity_of(with_tasks),
                })
                module_minis.extend(with_tasks)
                module_started |= lesson_started
                all_finished_lesson |= lesson_finished
            module_tasks = sum(mini_totals[mini_id] for mini_id in module_minis)
            progress = [
                min(1.0, sum(completed.get(user_id, {}).get(mini_id, 0) for mini_id in module_minis) / module_tasks)
                for user_id in module_started
            ] if module_tasks else []
            module.update({
                "lessons_count": len(module["lessons"]),
                "tasks": module_tasks,
                "started": len(module_started),
                "completed": sum(1 for user_id in module_started if finished(user_id, module_minis)),
                "average_progress": round(sum(progress) / len(progress), 4) if progress else None,
                **activity_of(module_minis),
            })
            all_started |= module_started

        module_list = list(modules.values())
        attempts = sum(module["attempts"] for module in module_list)
        return {
            "period": window.describe(),
            "summary": {
                "modules": len(module_list),
                "lessons": len(lessons),
                "tasks": sum(module["tasks"] for module in module_list),
                "students_started": len(all_started),
                "students_completed_lesson": len(all_finished_lesson),
                "attempts": attempts,
                "accuracy": _ratio(sum(module["correct"] for module in module_list), attempts),
            },
            "modules": module_list,
        }

    async def get_trial_tests(self, window: StatsWindow, *, exclude_admins: bool = False,
                              include_email: bool = False) -> Dict[str, Any]:
        admins = _without_admins("r.user_id", exclude_admins)
        async with self._connection() as db:
            result_rows = await self._rows(db, f"""
                SELECT r.id, r.user_id, u.nickname, r.trial_test_id, r.score, r.total, r.percentage,
                       r.completed_at, {window.local_day("r.completed_at")}, u.email
                FROM trial_test_results r
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.completed_at >= ? AND r.completed_at < ?{admins}
                ORDER BY r.id
            """, (window.previous_start_utc, window.end_utc))
            test_rows = await self._rows(db, """
                SELECT tt.id, tt.title, folder.name
                FROM trial_tests tt
                LEFT JOIN trial_test_folders folder ON folder.id = tt.folder_id
                ORDER BY tt.sort_order, tt.id
            """)
            # Stored answers are a JSON object keyed by the question id.
            question_rows = await self._rows(db, f"""
                SELECT ttt.id, ttt.trial_test_id, ttt.sort_order, ttt.deleted_at IS NOT NULL, bt.text,
                       COALESCE(stats.shown, 0), COALESCE(stats.correct, 0), COALESCE(stats.skipped, 0)
                FROM trial_test_tasks ttt
                LEFT JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
                LEFT JOIN (
                    SELECT entry.key AS task_key,
                           COUNT(*) AS shown,
                           COUNT(*) FILTER (WHERE entry.value ->> 'correct' IN ('true', '1')) AS correct,
                           COUNT(*) FILTER (WHERE btrim(COALESCE(entry.value ->> 'answer', '')) = '') AS skipped
                    FROM trial_test_results r
                    CROSS JOIN LATERAL jsonb_each(r.answers::jsonb) AS entry(key, value)
                    WHERE r.completed_at >= ? AND r.completed_at < ?{admins}
                    GROUP BY entry.key
                ) stats ON stats.task_key = ttt.id::text
                WHERE ttt.deleted_at IS NULL OR stats.shown > 0
                ORDER BY ttt.trial_test_id, ttt.sort_order, ttt.id
            """, (window.start_utc, window.end_utc))

        results = [
            {
                "id": int(row[0]), "user_id": int(row[1]), "nickname": row[2], "trial_test_id": int(row[3]),
                "score": _int(row[4]), "total": _int(row[5]), "percentage": float(row[6] or 0),
                "completed_at": _iso(row[7]), "day": row[8], "email": row[9],
            }
            for row in result_rows
        ]
        current = [item for item in results if window.start is None or item["day"] >= window.start]
        previous = [item for item in results if window.start is not None and item["day"] < window.start]

        def averages(items: List[Dict[str, Any]]) -> Dict[str, Any]:
            scores = [item["percentage"] for item in items]
            return {
                "attempts": len(items),
                "students": len({item["user_id"] for item in items}),
                "average": _ratio(sum(scores), len(scores) * 100),
                "median": round(median(scores) / 100, 4) if scores else None,
                "best": round(max(scores) / 100, 4) if scores else None,
            }

        questions_by_test: Dict[int, List[Dict[str, Any]]] = {}
        for row in question_rows:
            shown, correct = _int(row[5]), _int(row[6])
            questions_by_test.setdefault(int(row[1]), []).append({
                "task_id": int(row[0]), "number": _int(row[2]) + 1, "deleted": bool(row[3]),
                "text_preview": _preview(row[4], 200),
                "answers": shown, "correct": correct, "skipped": _int(row[7]), "accuracy": _ratio(correct, shown),
            })

        tests = []
        for row in test_rows:
            test_id = int(row[0])
            attempts = [item for item in current if item["trial_test_id"] == test_id]
            questions = questions_by_test.get(test_id, [])
            tests.append({
                "id": test_id, "title": row[1], "folder": row[2],
                "questions_count": sum(1 for item in questions if not item["deleted"]),
                **averages(attempts),
                "last_completed_at": max((item["completed_at"] for item in attempts if item["completed_at"]), default=None),
                "questions": questions if attempts else [],
            })
        tests.sort(key=lambda item: (-item["attempts"], item["id"]))

        distribution = [{"from": low, "to": low + 10, "count": 0} for low in range(0, 100, 10)]
        for item in current:
            distribution[min(9, max(0, int(item["percentage"] // 10)))]["count"] += 1

        first = window.start or min((item["day"] for item in current), default=window.today - timedelta(days=29))
        granularity, buckets = bucket_plan(first, window.today)
        points = []
        for start, end in buckets:
            scores = [item["percentage"] for item in current if start <= item["day"] <= end]
            points.append({"start": start.isoformat(), "end": end.isoformat(), "attempts": len(scores),
                           "average": _ratio(sum(scores), len(scores) * 100)})

        now, before = averages(current), averages(previous)
        titles = {int(row[0]): row[1] for row in test_rows}
        return {
            "period": window.describe(),
            "summary": {
                "attempts": self._kpi(window, now["attempts"], before["attempts"]),
                "students": self._kpi(window, now["students"], before["students"]),
                "average": self._kpi(window, now["average"], before["average"]),
                "median": now["median"],
                "best": now["best"],
                "tests_total": len(test_rows),
                "tests_taken": sum(1 for item in tests if item["attempts"]),
            },
            "series": {"granularity": granularity, "points": points},
            "distribution": distribution,
            "tests": tests,
            "emails_visible": include_email,
            "recent": [
                {
                    "result_id": item["id"], "user_id": item["user_id"], "nickname": item["nickname"],
                    **({"email": item["email"]} if include_email else {}),
                    "trial_test_id": item["trial_test_id"], "title": titles.get(item["trial_test_id"]),
                    "score": item["score"], "total": item["total"], "percentage": round(item["percentage"] / 100, 4),
                    "completed_at": item["completed_at"],
                }
                for item in sorted(current, key=lambda item: -item["id"])[:RECENT_LIMIT]
            ],
        }

    async def get_quizzes(self, window: StatsWindow) -> Dict[str, Any]:
        """Live quiz usage. Hosts are teachers, so admin accounts are never filtered out here."""
        async with self._connection() as db:
            session_rows = await self._rows(db, f"""
                SELECT s.id, s.quiz_id, q.title, s.host_id, host.nickname, s.status, s.created_at,
                       {window.local_day("s.created_at")},
                       COALESCE(p.participants, 0), COALESCE(p.guests, 0),
                       COALESCE(a.answers, 0), COALESCE(a.correct, 0)
                FROM quiz_sessions s
                JOIN quizzes q ON q.id = s.quiz_id
                LEFT JOIN users host ON host.id = s.host_id
                LEFT JOIN (
                    SELECT session_id, COUNT(*) AS participants, COUNT(*) FILTER (WHERE user_id IS NULL) AS guests
                    FROM quiz_participants GROUP BY session_id
                ) p ON p.session_id = s.id
                LEFT JOIN (
                    SELECT session_id, COUNT(*) AS answers, COUNT(*) FILTER (WHERE is_correct = 1) AS correct
                    FROM quiz_answers GROUP BY session_id
                ) a ON a.session_id = s.id
                WHERE s.created_at >= ? AND s.created_at < ?
                ORDER BY s.id
            """, (window.previous_start_utc, window.end_utc))
            quizzes_total = _int((await self._rows(db, "SELECT COUNT(*) FROM quizzes"))[0][0])

        sessions = [
            {
                "session_id": int(row[0]), "quiz_id": int(row[1]), "title": row[2], "host_id": row[3],
                "host_nickname": row[4], "status": row[5], "created_at": _iso(row[6]), "day": row[7],
                "participants": _int(row[8]), "guests": _int(row[9]), "answers": _int(row[10]),
                "correct": _int(row[11]), "accuracy": _ratio(_int(row[11]), _int(row[10])),
            }
            for row in session_rows
        ]
        current = [item for item in sessions if window.start is None or item["day"] >= window.start]
        previous = [item for item in sessions if window.start is not None and item["day"] < window.start]

        def totals(items: List[Dict[str, Any]]) -> Dict[str, Any]:
            answered = sum(item["answers"] for item in items)
            return {
                "sessions": len(items),
                "participants": sum(item["participants"] for item in items),
                "answers": answered,
                "accuracy": _ratio(sum(item["correct"] for item in items), answered),
            }

        by_quiz: Dict[int, Dict[str, Any]] = {}
        for item in current:
            quiz = by_quiz.setdefault(item["quiz_id"], {
                "quiz_id": item["quiz_id"], "title": item["title"], "sessions": 0, "participants": 0,
                "answers": 0, "correct": 0, "last_session_at": None,
            })
            quiz["sessions"] += 1
            quiz["participants"] += item["participants"]
            quiz["answers"] += item["answers"]
            quiz["correct"] += item["correct"]
            quiz["last_session_at"] = max(filter(None, (quiz["last_session_at"], item["created_at"])), default=None)
        quizzes = sorted(by_quiz.values(), key=lambda quiz: (-quiz["sessions"], -quiz["participants"], quiz["quiz_id"]))
        for quiz in quizzes:
            quiz["accuracy"] = _ratio(quiz.pop("correct"), quiz["answers"])

        first = window.start or min((item["day"] for item in current), default=window.today - timedelta(days=29))
        granularity, buckets = bucket_plan(first, window.today)
        points = [
            {
                "start": start.isoformat(), "end": end.isoformat(),
                "sessions": sum(1 for item in current if start <= item["day"] <= end),
                "participants": sum(item["participants"] for item in current if start <= item["day"] <= end),
            }
            for start, end in buckets
        ]
        now, before = totals(current), totals(previous)
        return {
            "period": window.describe(),
            "summary": {
                "sessions": self._kpi(window, now["sessions"], before["sessions"]),
                "participants": self._kpi(window, now["participants"], before["participants"]),
                "answers": self._kpi(window, now["answers"], before["answers"]),
                "accuracy": self._kpi(window, now["accuracy"], before["accuracy"]),
                "finished_sessions": sum(1 for item in current if item["status"] == "finished"),
                "guests": sum(item["guests"] for item in current),
                "hosts": len({item["host_id"] for item in current}),
                "quizzes_total": quizzes_total,
                "quizzes_played": len(quizzes),
            },
            "series": {"granularity": granularity, "points": points},
            "quizzes": quizzes,
            "recent": [
                {key: item[key] for key in (
                    "session_id", "quiz_id", "title", "host_nickname", "status", "created_at",
                    "participants", "guests", "answers", "accuracy",
                )}
                for item in sorted(current, key=lambda item: -item["session_id"])[:RECENT_LIMIT]
            ],
        }
