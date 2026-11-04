"""Folder operations shared by the trial-test repository.

All structure and test-placement writes use the same database writer reservation,
including PostgreSQL's transaction advisory lock, so checks cannot race writes.
"""
from typing import Optional

import storage as db_driver


class TrialFolderError(ValueError):
    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


class TrialFolderMixin:
    @staticmethod
    def _folder_name(name: str) -> str:
        name = (name or "").strip()
        if not 1 <= len(name) <= 120:
            raise TrialFolderError("Папка атауы 1–120 таңба болуы керек.", 400)
        return name

    async def _folder_rows(self, db):
        db.row_factory = db_driver.Row
        async with db.execute("SELECT * FROM trial_test_folders ORDER BY sort_order, name, id") as cursor:
            return {row["id"]: dict(row) for row in await cursor.fetchall()}

    @staticmethod
    def _root_name(folders, folder_id):
        seen = set()
        while folder_id in folders and folder_id not in seen:
            seen.add(folder_id)
            folder = folders[folder_id]
            if folder["parent_id"] is None:
                return folder["name"]
            folder_id = folder["parent_id"]
        raise TrialFolderError("Папка табылмады.", 404)

    async def _test_folder(self, db, folder_id: Optional[int], category: Optional[str]):
        folders = await self._folder_rows(db)
        if folder_id is None:
            name = self._folder_name(category or "Жалпы")
            folder_id = next((key for key, f in folders.items() if f["parent_id"] is None and f["name"] == name), None)
            if folder_id is None:
                cursor = await db.execute("INSERT INTO trial_test_folders (name) VALUES (?)", (name,))
                folder_id = int(cursor.lastrowid)
                folders[folder_id] = {"id": folder_id, "name": name, "parent_id": None, "sort_order": 0}
        if folder_id not in folders:
            raise TrialFolderError("Папка табылмады.", 404)
        if any(f["parent_id"] == folder_id for f in folders.values()):
            raise TrialFolderError("Тестті ішкі папкасы жоқ папкаға орналастырыңыз.")
        return folder_id, self._root_name(folders, folder_id)

    async def get_trial_test_folders(self, *, include_empty: bool = False):
        async with self._connection() as db:
            folders = await self._folder_rows(db)
            async with db.execute("SELECT folder_id, COUNT(*) FROM trial_tests GROUP BY folder_id") as cursor:
                counts = {row[0]: row[1] for row in await cursor.fetchall()}
            for folder in folders.values():
                folder["direct_test_count"] = counts.get(folder["id"], 0)
                folder["test_count"] = 0
                folder["child_count"] = 0
            for folder in folders.values():
                parent = folders.get(folder["parent_id"])
                if parent:
                    parent["child_count"] += 1
                current = folder
                seen = set()
                while current and current["id"] not in seen:
                    seen.add(current["id"])
                    current["test_count"] += folder["direct_test_count"]
                    current = folders.get(current["parent_id"])
            return [f for f in folders.values() if include_empty or f["test_count"] > 0]

    async def create_trial_test_folder(self, name: str, parent_id: Optional[int] = None,
                                      sort_order: int = 0, move_existing_tests: bool = False):
        name = self._folder_name(name)
        async with self._write_transaction() as db:
            folders = await self._folder_rows(db)
            if parent_id is not None and parent_id not in folders:
                raise TrialFolderError("Ата-ана папка табылмады.", 404)
            if any(f["parent_id"] == parent_id and f["name"] == name for f in folders.values()):
                raise TrialFolderError("Бұл жерде осындай атаулы папка бар.")
            async with db.execute("SELECT COUNT(*) FROM trial_tests WHERE folder_id = ?", (parent_id,)) as cursor:
                count = (await cursor.fetchone())[0]
            if count and not move_existing_tests:
                raise TrialFolderError("Қазіргі тесттерді жаңа ішкі папкаға көшіруді растаңыз.")
            cursor = await db.execute("INSERT INTO trial_test_folders (name, parent_id, sort_order) VALUES (?, ?, ?)",
                                      (name, parent_id, sort_order))
            folder_id = int(cursor.lastrowid)
            if count:
                await db.execute("UPDATE trial_tests SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE folder_id = ?",
                                 (folder_id, parent_id))
        return {"id": folder_id, "parent_id": parent_id, "name": name, "sort_order": sort_order}

    async def update_trial_test_folder(self, folder_id: int, *, name: Optional[str] = None,
                                      parent_id: Optional[int] = None, move: bool = False,
                                      sort_order: Optional[int] = None):
        async with self._write_transaction() as db:
            folders = await self._folder_rows(db)
            if folder_id not in folders:
                raise TrialFolderError("Папка табылмады.", 404)
            folder = folders[folder_id]
            new_name = self._folder_name(name) if name is not None else folder["name"]
            new_parent = parent_id if move else folder["parent_id"]
            if new_parent is not None and new_parent not in folders:
                raise TrialFolderError("Ата-ана папка табылмады.", 404)
            current = new_parent
            while current is not None:
                if current == folder_id:
                    raise TrialFolderError("Папканы өзінің ішіне немесе ішкі папкасына көшіруге болмайды.")
                current = folders[current]["parent_id"]
            if any(f["id"] != folder_id and f["parent_id"] == new_parent and f["name"] == new_name for f in folders.values()):
                raise TrialFolderError("Бұл жерде осындай атаулы папка бар.")
            if move and new_parent is not None:
                async with db.execute("SELECT COUNT(*) FROM trial_tests WHERE folder_id = ?", (new_parent,)) as cursor:
                    if (await cursor.fetchone())[0]:
                        raise TrialFolderError("Алдымен бұл папкадағы тесттерді ішкі папкаға көшіріңіз.")
            folder.update(name=new_name, parent_id=new_parent,
                          sort_order=folder["sort_order"] if sort_order is None else sort_order)
            await db.execute("UPDATE trial_test_folders SET name = ?, parent_id = ?, sort_order = ? WHERE id = ?",
                             (new_name, new_parent, folder["sort_order"], folder_id))
            # Keep the legacy root category usable by older clients and rollback.
            for item in folders.values():
                await db.execute("UPDATE trial_tests SET category = ? WHERE folder_id = ?",
                                 (self._root_name(folders, item["id"]), item["id"]))
            return folder

    async def delete_trial_test_folder(self, folder_id: int):
        async with self._write_transaction() as db:
            folders = await self._folder_rows(db)
            if folder_id not in folders:
                raise TrialFolderError("Папка табылмады.", 404)
            if any(f["parent_id"] == folder_id for f in folders.values()):
                raise TrialFolderError("Ішкі папкалары бар папканы жоюға болмайды.")
            async with db.execute("SELECT COUNT(*) FROM trial_tests WHERE folder_id = ?", (folder_id,)) as cursor:
                if (await cursor.fetchone())[0]:
                    raise TrialFolderError("Тесттері бар папканы жоюға болмайды.")
            await db.execute("DELETE FROM trial_test_folders WHERE id = ?", (folder_id,))
