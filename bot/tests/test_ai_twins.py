"""AI twin drafts with the provider replaced by a fake; no network calls.

Run from bot/: python -m pytest tests/test_ai_twins.py

Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import json
import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from routes.admin.bank_twins import register_bank_twin_routes
from services import ai_twins
from services.ai_twins import AiTwinError, TwinDraft

ADMIN = "ai-admin@example.test"
STUDENT = "ai-student@example.test"
AI_ENV = {"AI_TWIN_BASE_URL": "https://provider.test/v1", "AI_TWIN_API_KEY": "test-key", "AI_TWIN_MODEL": "test-model"}


class AiTwinTests(PostgresTestCase):
    environment = AI_ENV

    async def asyncSetUp(self):
        await super().asyncSetUp()
        await self.db.users.create_user_by_email(ADMIN, check_admin_email=ADMIN)
        await self.db.users.set_admin_with_role(email=ADMIN, is_admin=True, role="super_admin")
        await self.db.users.create_user_by_email(STUDENT)
        self.student = await self.db.users.get_user_by_email(STUDENT)
        bank = self.db.bank_tasks
        self.source = await bank.create_task(text="Есептеңіз: $27+15$", answer="42", question_type="input",
                                              answer_mode="written", difficulty="A", topics=["Қосу"])
        self.choice = await bank.create_task(text="$8\\cdot 7$ неге тең?", answer="B", question_type="mcq", difficulty="A",
                                              options=[{"label": label, "text": text} for label, text in zip("ABCD", ["54", "56", "64", "48"])])
        self.pictured = await bank.create_task(text="Суреттегі бұрышты табыңыз", answer="30", question_type="input",
                                                difficulty="B", image_filename="angle.png")
        async with self.seed() as connection:
            await connection.execute("INSERT INTO modules (id, name) VALUES (1, 'Арифметика')")
            await connection.execute("INSERT INTO sections (id, module_id, name) VALUES (1, 1, 'Амалдар')")
            await connection.execute("INSERT INTO lessons (id, section_id, title) VALUES (1, 1, 'Қосу')")
            await connection.execute("INSERT INTO mini_lessons (id, lesson_id, mini_index) VALUES (1, 1, 1)")
            await connection.execute("INSERT INTO tasks (id, mini_lesson_id, bank_task_id) VALUES (11, 1, ?)", (self.source["id"],))
            await connection.commit()
        task = await self.db.tasks.get_task_by_id(11)
        for answer in ("40", "42"):
            await self.db.record_solution(self.student["id"], 11, answer, answer == "42", task_snapshot=task)

        app = FastAPI()
        app.state.db = self.db
        app.state.limiter = Limiter(key_func=get_remote_address)
        register_bank_twin_routes(app, self.db, app.state.limiter)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://ai.test")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def _generate(self, source_id, drafts):
        with patch.object(ai_twins, "generate_twin_drafts", AsyncMock(return_value=drafts)):
            return await self.client.post(f"/api/admin/bank/tasks/{source_id}/twins/ai-drafts", data={"email": ADMIN})

    async def test_status_reports_configuration_without_secrets(self):
        response = await self.client.get("/api/admin/bank/ai-twins/status", params={"email": ADMIN})
        self.assertEqual(response.json(), {"enabled": True, "model": "test-model", "drafts_per_request": 3})
        self.assertNotIn("test-key", response.text)
        with patch.dict(os.environ, {"AI_TWIN_API_KEY": ""}):
            self.assertFalse((await self.client.get("/api/admin/bank/ai-twins/status", params={"email": ADMIN})).json()["enabled"])

    async def test_drafts_are_stored_hidden_from_review_until_approved(self):
        drafts = [TwinDraft(text="Есептеңіз: $36+17$", answer="53"), TwinDraft(text="Есептеңіз: $45+28$", answer="73"),
                  TwinDraft(text="Есептеңіз: $27+15$", answer="42")]
        response = await self._generate(self.source["id"], drafts)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(len(body["items"]), 2)
        self.assertEqual([item["index"] for item in body["skipped"]], [3])  # identical to the source
        listed = await self.db.bank_tasks.list_twins(self.source["id"])
        self.assertEqual({(item["twin_status"], item["twin_origin"], item["twin_ai_model"]) for item in listed},
                         {("draft", "ai", "test-model")})
        source = await self.db.bank_tasks.get_task_by_id(self.source["id"])
        self.assertEqual((source["twin_count"], source["twin_draft_count"]), (0, 2))

        review = await self.db.module_review.get_review(self.student["id"], 1)
        self.assertEqual(review["current"]["kind"], "original")  # drafts are never served

        first = body["items"][0]["id"]
        approved = await self.client.post(f"/api/admin/bank/tasks/{first}/approve", data={"email": ADMIN})
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["twin_status"], "approved")
        self.assertEqual((await self.client.post(f"/api/admin/bank/tasks/{first}/approve", data={"email": ADMIN})).status_code, 409)
        review = await self.db.module_review.get_review(self.student["id"], 1)
        self.assertEqual((review["current"]["kind"], review["current"]["task"]["bank_task_id"]), ("twin", first))

    async def test_drafts_follow_bank_rules_for_choices(self):
        options = lambda *texts: [{"label": label, "text": text} for label, text in zip("ABCD", texts)]
        drafts = [
            TwinDraft.model_validate({"text": "$9\\cdot 6$ неге тең?", "answer": "A", "options": options("54", "56", "63", "45")}),
            TwinDraft.model_validate({"text": "$7\\cdot 6$ неге тең?", "answer": "E", "options": options("42", "36", "48", "49")}),
            TwinDraft.model_validate({"text": "$6\\cdot 6$ неге тең?", "answer": "A", "options": options("36", "30")}),
        ]
        body = (await self._generate(self.choice["id"], drafts)).json()
        self.assertEqual(len(body["items"]), 1)
        self.assertEqual(body["items"][0]["answer"], "A")
        self.assertEqual([item["index"] for item in body["skipped"]], [2, 3])

    async def test_check_compares_an_independent_solution_with_the_platform_checker(self):
        body = (await self._generate(self.source["id"], [TwinDraft(text="Есептеңіз: $36+17$", answer="53")])).json()
        twin_id = body["items"][0]["id"]
        for solved, expected in (("53", "match"), ("52", "mismatch")):
            with patch.object(ai_twins, "solve_task", AsyncMock(return_value=solved)):
                response = await self.client.post(f"/api/admin/bank/tasks/{twin_id}/ai-check", data={"email": ADMIN})
            self.assertEqual(response.json(), {"status": expected, "answer": solved, "checked_version": 1})
        listed = await self.db.bank_tasks.list_twins(self.source["id"])
        self.assertEqual(listed[0]["ai_check"], {"status": "mismatch", "answer": "52", "checked_version": 1})
        with patch.object(ai_twins, "solve_task", AsyncMock(side_effect=AiTwinError("timeout", "slow"))):
            response = await self.client.post(f"/api/admin/bank/tasks/{twin_id}/ai-check", data={"email": ADMIN})
        self.assertEqual(response.status_code, 504)
        self.assertEqual((await self.db.bank_tasks.list_twins(self.source["id"]))[0]["ai_check"]["status"], "error")

    async def test_refusals_without_calling_the_provider(self):
        generate = AsyncMock(return_value=[])
        with patch.object(ai_twins, "generate_twin_drafts", generate):
            pictured = await self.client.post(f"/api/admin/bank/tasks/{self.pictured['id']}/twins/ai-drafts", data={"email": ADMIN})
            student = await self.client.post(f"/api/admin/bank/tasks/{self.source['id']}/twins/ai-drafts", data={"email": STUDENT})
        self.assertEqual((pictured.status_code, student.status_code), (400, 403))
        generate.assert_not_called()
        with patch.dict(os.environ, {"AI_TWIN_MODEL": ""}):
            response = await self.client.post(f"/api/admin/bank/tasks/{self.source['id']}/twins/ai-drafts", data={"email": ADMIN})
        self.assertEqual(response.status_code, 503)

    async def test_provider_output_is_parsed_and_validated(self):
        def reply(content):
            return AsyncMock(return_value=content)

        fenced = "```json\n" + json.dumps({"twins": [{"text": "Есептеңіз: $36+17$", "answer": "53"}]}) + "\n```"
        with patch.object(ai_twins, "_chat", reply(fenced)):
            drafts = await ai_twins.generate_twin_drafts(self.source)
        self.assertEqual((drafts[0].text, drafts[0].answer, drafts[0].options), ("Есептеңіз: $36+17$", "53", None))
        for bad in ("not json", json.dumps({"twins": [{"text": "x"}]})):
            with patch.object(ai_twins, "_chat", reply(bad)), self.assertRaises(AiTwinError) as raised:
                await ai_twins.generate_twin_drafts(self.source)
            self.assertEqual(raised.exception.kind, "invalid_output")
        with patch.object(ai_twins, "_chat", reply('{"answer": "53"}')) as chat:
            self.assertEqual(await ai_twins.solve_task({**self.source, "text": "Есептеңіз: $36+17$"}), "53")
        self.assertNotIn("42", chat.call_args.args[1])  # the solver never sees an answer

    async def test_chat_completions_request_against_a_local_provider(self):
        from aiohttp import web
        from aiohttp.test_utils import TestServer

        seen = []

        async def completions(request):
            seen.append((request.headers.get("Authorization"), await request.json()))
            if len(seen) > 1:
                return web.json_response({"error": {"message": "quota for test-key exceeded"}}, status=429)
            return web.json_response({"choices": [{"message": {"content": '{"answer": "53"}'}}]})

        provider = web.Application()
        provider.router.add_post("/v1/chat/completions", completions)
        async with TestServer(provider) as server:
            with patch.dict(os.environ, {"AI_TWIN_BASE_URL": str(server.make_url("/v1/"))}):
                self.assertEqual(await ai_twins.solve_task(self.source), "53")
                with self.assertRaises(AiTwinError) as raised:
                    await ai_twins.solve_task(self.source)
        authorization, body = seen[0]
        self.assertEqual(authorization, "Bearer test-key")
        self.assertEqual((body["model"], body["response_format"]), ("test-model", {"type": "json_object"}))
        self.assertEqual([message["role"] for message in body["messages"]], ["system", "user"])
        self.assertEqual(raised.exception.kind, "provider")
        self.assertNotIn("test-key", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
