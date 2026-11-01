"""Student task choices expose display fields, never imported grading metadata."""
from copy import deepcopy
import json
from urllib.parse import urlencode

import pytest

from tests.route_helpers import _proxy_headers
import utils.public_payload as payloads


SECRET = "public-task-payload-regression-secret"


@pytest.fixture(autouse=True)
def production_identity(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", SECRET)


def get_as(client, path, user):
    query = urlencode({"email": user["email"]})
    return client.get(path + "?" + query, headers=_proxy_headers("GET", path, query, user["email"], SECRET))


def post_as(client, path, user, data, form=False):
    body = urlencode(data) if form else json.dumps(data)
    content_type = "application/x-www-form-urlencoded" if form else "application/json"
    headers = _proxy_headers("POST", path, "", user["email"], SECRET, body=body, content_type=content_type)
    return client.post(path, content=body, headers={**headers, "Content-Type": content_type})


def dirty_options(count):
    return [
        {"label": label, "text": rf"\frac{{{index}}}{{2}}", "correct": label == "A", "is_correct": label == "A",
         "answer": "private-answer", "accepted_answers": ["private-alias"], "solution": "private-solution",
         "grading": {"expected": "private-answer"}, "teacher_note": "private-note"}
        for index, label in enumerate("ABCDEF"[:count], start=1)
    ]


@pytest.fixture(params=[("mcq", 4, "A"), ("mcq6", 6, '["A", "C"]'), ("select", 4, '["B", "D"]')])
async def placed_task(client, test_db, test_user, request):
    question_type, count, answer = request.param
    await test_db.users.set_admin(email=test_user["email"], is_admin=True)
    student = await test_db.users.create_user_by_email("payload-student@example.com")
    options = dirty_options(count)
    subquestions = [
        {"text": "First match", "correct": "B", "is_correct": True, "grading": "private-match"},
        {"text": "Second match", "correct": "D", "answer": "private-match"},
    ] if question_type == "select" else None
    form = {
        "email": test_user["email"], "text": "Choose a value", "answer": answer,
        "question_type": question_type, "difficulty": "B", "options": json.dumps(options),
    }
    if subquestions:
        form["subquestions"] = json.dumps(subquestions)
    created = post_as(client, "/api/admin/bank/tasks", test_user, form, form=True)
    assert created.status_code == 200, created.text
    bank = created.json()
    module = await test_db.curriculum.create_module("Payload module")
    section = await test_db.curriculum.create_section(module["id"], "Payload section")
    lesson = await test_db.curriculum.create_lesson(section["id"], 1)
    mini = (await test_db.curriculum.get_mini_lessons_by_lesson(lesson["id"]))[0]
    task = await test_db.create_task_in_mini_lesson(mini["id"], "", "", test_user["id"], bank_task_id=bank["id"])
    trial = await test_db.trial_tests.create_trial_test("Payload trial", created_by=test_user["id"])
    trial_task = await test_db.trial_tests.create_trial_test_task(trial["id"], "", "", bank_task_id=bank["id"])
    return {"admin": test_user, "student": student, "bank": bank, "lesson": lesson, "task": task,
            "trial": trial, "trial_task": trial_task, "options": options, "subquestions": subquestions}


def assert_public_choices(task, context):
    assert task["options"] == [{"label": option["label"], "text": option["text"]} for option in context["options"]]
    assert task["subquestions"] == ([{"text": sub["text"]} for sub in context["subquestions"]]
                                      if context["subquestions"] else None)
    assert "private-" not in json.dumps(task)


@pytest.mark.asyncio
@pytest.mark.parametrize("anonymous", [False, True])
async def test_lesson_choices_hide_metadata_for_students_and_anonymous_readers(client, placed_task, anonymous):
    path = f"/api/lessons/{placed_task['lesson']['id']}"
    response = client.get(path) if anonymous else get_as(client, path, placed_task["student"])
    assert response.status_code == 200
    task = response.json()["mini_lessons"][0]["tasks"][0]
    assert task["answer"] is None
    assert_public_choices(task, placed_task)


@pytest.mark.asyncio
async def test_trial_choices_hide_metadata_without_rewriting_admin_content(client, test_db, placed_task):
    response = get_as(client, f"/api/trial-tests/{placed_task['trial']['id']}", placed_task["student"])
    assert response.status_code == 200
    task = response.json()["tasks"][0]
    assert "answer" not in task
    assert_public_choices(task, placed_task)

    admin_view = get_as(client, f"/api/admin/bank/tasks/{placed_task['bank']['id']}", placed_task["admin"])
    assert admin_view.status_code == 200
    assert admin_view.json()["options"] == placed_task["options"]
    assert admin_view.json()["subquestions"] == placed_task["subquestions"]
    saved = await test_db.bank_tasks.get_task_by_id(placed_task["bank"]["id"])
    assert saved["options"] == placed_task["options"]


@pytest.mark.asyncio
async def test_legacy_task_endpoint_whitelists_choice_payloads(client, placed_task):
    response = client.get(f"/api/tasks/{placed_task['task']['id']}")
    assert response.status_code == 200
    assert response.json()["questions"] == [
        {"label": option["label"], "text": option["text"]} for option in placed_task["options"]
    ]
    assert "private-" not in response.text


@pytest.mark.asyncio
async def test_grading_and_saved_review_keep_expected_answers_but_hide_nested_metadata(client, test_db, placed_task):
    user = placed_task["student"]
    path = f"/api/trial-tests/{placed_task['trial']['id']}/submit"
    response = post_as(client, path, user, {
        "email": user["email"], "answers": {str(placed_task["trial_task"]["id"]): placed_task["bank"]["answer"]},
    })
    assert response.status_code == 200
    assert response.json()["score"] == 1
    review = response.json()["results"][str(placed_task["trial_task"]["id"])]
    assert review["correct"] is True
    assert review["correct_answer"] == placed_task["bank"]["answer"]
    assert_public_choices(review["task"], placed_task)
    saved = await test_db.trial_tests.get_user_trial_test_results(user["id"], placed_task["trial"]["id"])
    snapshot = json.loads(saved[0]["answers"])[str(placed_task["trial_task"]["id"])]["task"]
    assert_public_choices(snapshot, placed_task)


@pytest.mark.asyncio
async def test_old_solo_and_coop_review_snapshots_are_sanitized_when_read(client, test_db, placed_task):
    user = placed_task["student"]
    answers = {str(placed_task["trial_task"]["id"]): placed_task["bank"]["answer"]}
    solo = post_as(client, f"/api/trial-tests/{placed_task['trial']['id']}/submit", user, {
        "email": user["email"], "answers": answers,
    })
    assert solo.status_code == 200
    session = await test_db.trial_test_coop.create_session(placed_task["trial"]["id"], user["id"])
    await test_db.trial_test_coop.add_participant(session["id"], user["id"], "blue")
    coop = post_as(client, f"/api/trial-tests/{placed_task['trial']['id']}/coop/finish", user, {
        "email": user["email"], "session_id": session["id"], "answers": answers,
    })
    assert coop.status_code == 200
    records = await test_db.trial_tests.get_user_trial_test_results(user["id"], placed_task["trial"]["id"])
    assert len(records) == 2
    for record in records:
        old_answers = json.loads(record["answers"])
        snapshot = old_answers[str(placed_task["trial_task"]["id"])]["task"]
        snapshot["options"] = json.dumps(placed_task["options"])
        snapshot["subquestions"] = json.dumps(placed_task["subquestions"])
        async with test_db.trial_tests._connection() as connection:
            await connection.execute("UPDATE trial_test_results SET answers = ? WHERE id = ?",
                                     (json.dumps(old_answers), record["id"]))
            await connection.commit()

    history = get_as(client, f"/api/trial-tests/{placed_task['trial']['id']}/results", user)
    coop_history = get_as(client, f"/api/trial-tests/coop/session/{session['id']}/results", user)
    assert history.status_code == coop_history.status_code == 200
    assert len(history.json()) == 2
    assert len(coop_history.json()["items"]) == 1
    retry = post_as(client, f"/api/trial-tests/{placed_task['trial']['id']}/submit", user, {
        "email": user["email"], "answers": answers, "attempt_id": solo.json()["attempt_id"],
    })
    assert retry.status_code == 200
    assert retry.json()["result_id"] == solo.json()["result_id"]
    assert retry.json()["score"] == 1
    assert_public_choices(retry.json()["results"][str(placed_task["trial_task"]["id"])]["task"], placed_task)
    for item in [*history.json(), *coop_history.json()["items"]]:
        review = item["answers"][str(placed_task["trial_task"]["id"])]
        assert item["score"] == 1
        assert review["correct_answer"] == placed_task["bank"]["answer"]
        assert review["correct"] is True
        assert review["task"]["correct_count"] == (2 if placed_task["bank"]["question_type"] == "mcq6" else 1)
        assert_public_choices(review["task"], placed_task)
    unchanged = await test_db.trial_tests.get_user_trial_test_results(user["id"], placed_task["trial"]["id"])
    assert all("private-" in record["answers"] for record in unchanged)


def test_choice_sanitization_preserves_latex_order_and_source_metadata():
    source = dirty_options(6)
    before = deepcopy(source)
    assert payloads.public_options(source) == [{"label": option["label"], "text": option["text"]} for option in source]
    assert source == before


@pytest.mark.parametrize("value", [None, {}, "[]", 42])
def test_public_options_reject_non_array_payloads(value):
    assert payloads.public_options(value) is None


def test_public_options_do_not_allow_metadata_inside_display_fields():
    assert payloads.public_options([
        None, 42, {"label": {"answer": "private-answer"}, "text": "Value"},
        {"label": "A", "text": {"answer": "private-answer"}}, {"label": "B"},
    ]) == [{"label": "B", "text": ""}]


def test_public_subquestions_reject_unknown_and_nested_metadata():
    assert payloads.public_subquestions([
        {"text": "Match", "correct": "A", "is_correct": True, "grading": "private-answer"},
        {"text": {"answer": "private-answer"}}, None,
    ]) == [{"text": "Match"}]


def test_legacy_nested_correctness_flags_are_removed():
    assert payloads.strip_solution_fields({"choices": [{"text": "Value", "is_correct": True}]}) == {
        "choices": [{"text": "Value"}],
    }


def test_legacy_subquestion_choice_text_survives_without_grading_fields():
    assert payloads.public_subquestions([{
        "text": "Composite question", "answer": "42", "teacher_note": "private-note",
        "choices": [{"text": "42", "correct": True, "is_correct": True, "grading": "private-answer"}, "43"],
    }]) == [{"text": "Composite question", "choices": [{"text": "42"}, "43"]}]
