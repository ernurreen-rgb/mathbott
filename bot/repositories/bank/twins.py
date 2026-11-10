"""
Twin tasks: number-only variants of a source task, served in module mistake review.
"""
from typing import Optional, List, Dict, Any, Tuple
import json
import storage as db_driver

from utils.validation import normalize_task_answer_for_compare

# Twins live in the bank but stay out of the library, pickers and quality reports.
NOT_TWIN_SQL = "NOT EXISTS (SELECT 1 FROM bank_task_twins tw WHERE tw.twin_bank_task_id = bt.id)"
IS_TWIN_SQL = "EXISTS (SELECT 1 FROM bank_task_twins tw WHERE tw.twin_bank_task_id = bt.id)"


def _canonical(value: Any) -> str:
    # Empty and missing choice lists are the same content.
    return json.dumps(value or [], ensure_ascii=False, sort_keys=True)


class BankTwinError(ValueError):
    """Raised when a twin cannot be created for the requested source."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class BankTaskTwinsMixin:
    AUDIT_ACTION_TWIN_CREATE = "twin_create"

    async def _fetch_twin_info(
        self, db: db_driver.Connection, task_ids: List[int],
    ) -> Tuple[Dict[int, int], Dict[int, int]]:
        """Return (twin -> source, source -> active approved twin count)."""
        if not task_ids:
            return {}, {}
        placeholders = ",".join(["?"] * len(task_ids))
        source_by_twin: Dict[int, int] = {}
        async with db.execute(
            f"SELECT twin_bank_task_id, source_bank_task_id FROM bank_task_twins WHERE twin_bank_task_id IN ({placeholders})",
            task_ids,
        ) as cursor:
            for row in await cursor.fetchall():
                source_by_twin[int(row[0])] = int(row[1])
        twin_counts: Dict[int, int] = {}
        async with db.execute(
            f"""
            SELECT tw.source_bank_task_id, COUNT(*)
            FROM bank_task_twins tw
            JOIN bank_tasks twin ON twin.id = tw.twin_bank_task_id AND twin.deleted_at IS NULL
            WHERE tw.status = 'approved' AND tw.source_bank_task_id IN ({placeholders})
            GROUP BY tw.source_bank_task_id
            """,
            task_ids,
        ) as cursor:
            for row in await cursor.fetchall():
                twin_counts[int(row[0])] = int(row[1])
        return source_by_twin, twin_counts

    async def _attach_twin_info(self, db: db_driver.Connection, items: List[Dict[str, Any]]) -> None:
        source_by_twin, twin_counts = await self._fetch_twin_info(db, [int(item["id"]) for item in items])
        for item in items:
            task_id = int(item["id"])
            item["twin_source_id"] = source_by_twin.get(task_id)
            item["twin_count"] = twin_counts.get(task_id, 0)

    async def count_twins_for_bank_tasks(self, bank_task_ids: List[int]) -> Dict[int, int]:
        ids = sorted({int(task_id) for task_id in bank_task_ids if task_id})
        if not ids:
            return {}
        async with self._connection() as db:
            _, twin_counts = await self._fetch_twin_info(db, ids)
        return twin_counts

    async def list_twins(self, source_task_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute(
                """
                SELECT bt.*, tw.status AS twin_status, tw.origin AS twin_origin
                FROM bank_task_twins tw
                JOIN bank_tasks bt ON bt.id = tw.twin_bank_task_id
                WHERE tw.source_bank_task_id = ? AND bt.deleted_at IS NULL
                ORDER BY tw.sort_order ASC, tw.id ASC
                """,
                (source_task_id,),
            ) as cursor:
                rows = await cursor.fetchall()
            task_ids = [int(row["id"]) for row in rows]
            topics_map = await self._fetch_topics_map(db, task_ids)
            items: List[Dict[str, Any]] = []
            for row in rows:
                item = self._serialize_task_row(row, topics_map.get(int(row["id"]), []))
                item["current_version"] = int(item.get("current_version") or 1)
                item["twin_source_id"] = source_task_id
                item["twin_count"] = 0
                items.append(item)
            return items

    async def create_twin(
        self,
        source_task_id: int,
        *,
        text: str,
        answer: str,
        question_type: str,
        answer_mode: str,
        accepted_answers: Optional[List[str]],
        text_scale: str,
        difficulty: str,
        topics: List[str],
        options: Optional[List[Dict[str, Any]]],
        subquestions: Optional[List[Dict[str, Any]]],
        image_filename: Optional[str],
        keep_source_image: bool,
        created_by: Optional[int],
        actor_email: Optional[str],
    ) -> Dict[str, Any]:
        async with self._write_transaction() as db:
            db.row_factory = db_driver.Row
            source = await self._fetch_task_row(db, source_task_id)
            if not source or source.get("deleted_at"):
                raise BankTwinError("not_found", "Бастапқы есеп табылмады.")
            async with db.execute(
                "SELECT 1 FROM bank_task_twins WHERE twin_bank_task_id = ?", (source_task_id,),
            ) as cursor:
                if await cursor.fetchone():
                    raise BankTwinError("twin_of_twin", "Егіздің өз егізі болмайды. Бастапқы есепке егіз қосыңыз.")
            if (question_type or "input") != (source.get("question_type") or "input"):
                raise BankTwinError("question_type", "Егіз бастапқы есеппен бірдей сұрақ түрінде болуы керек.")
            unchanged = (
                " ".join((text or "").split()) == " ".join((source.get("text") or "").split())
                and normalize_task_answer_for_compare(source, answer) == normalize_task_answer_for_compare(source, source.get("answer"))
                and _canonical(options) == _canonical(self._parse_json_field(source.get("options")))
                and _canonical(subquestions) == _canonical(self._parse_json_field(source.get("subquestions")))
                and not image_filename
            )
            if unchanged:
                raise BankTwinError("unchanged", "Егіз бастапқы есептен өзгеше болуы керек: сандарды және жауапты өзгертіңіз.")

            resolved_image = image_filename or (source.get("image_filename") if keep_source_image else None)
            twin_id = await self._insert_bank_task(
                db,
                text=text,
                answer=answer,
                question_type=question_type,
                difficulty=difficulty,
                answer_mode=answer_mode,
                accepted_answers=accepted_answers,
                text_scale=text_scale,
                topics=topics,
                options=options,
                subquestions=subquestions,
                image_filename=resolved_image,
                solution_filename=None,
                created_by=created_by,
                source="admin_bank_twin_create",
                reason=f"Twin of bank task #{source_task_id}",
            )
            async with db.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM bank_task_twins WHERE source_bank_task_id = ?",
                (source_task_id,),
            ) as cursor:
                row = await cursor.fetchone()
                sort_order = int(row[0] or 0) if row else 0
            await db.execute(
                """
                INSERT INTO bank_task_twins (source_bank_task_id, twin_bank_task_id, status, origin, sort_order, created_by)
                VALUES (?, ?, 'approved', 'manual', ?, ?)
                """,
                (source_task_id, twin_id, sort_order, created_by),
            )
            await self._record_admin_audit_event(
                db,
                action=self.AUDIT_ACTION_TWIN_CREATE,
                entity_type="bank_task",
                entity_id=twin_id,
                actor_user_id=created_by,
                actor_email=actor_email,
                summary=f"Created twin #{twin_id} of bank task #{source_task_id}",
                changed_fields=["twin_of"],
                metadata={
                    "source_bank_task_id": source_task_id,
                    "text_preview": self._build_text_preview(text),
                    "question_type": question_type,
                    "image_from_source": bool(resolved_image and not image_filename),
                },
            )

        task = await self.get_task_by_id(twin_id, include_deleted=True)
        return task or {}

    async def _trash_twins_of(self, db: db_driver.Connection, source_task_ids: List[int]) -> int:
        """Move active twins to trash before their sources disappear for good."""
        if not source_task_ids:
            return 0
        placeholders = ",".join(["?"] * len(source_task_ids))
        cursor = await db.execute(
            f"""
            UPDATE bank_tasks
            SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE deleted_at IS NULL AND id IN (
                SELECT twin_bank_task_id FROM bank_task_twins WHERE source_bank_task_id IN ({placeholders})
            )
            """,
            source_task_ids,
        )
        return int(cursor.rowcount or 0)
