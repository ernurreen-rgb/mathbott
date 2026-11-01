"""Exact algebraic constants and numeric answers share a comparison form."""
import json

import pytest

from utils.math_equivalence import canonicalize_algebraic_expression
from utils.validation import is_task_answer_correct, normalize_task_answer_for_compare


@pytest.mark.parametrize(("expression", "number"), [
    ("x-x", "0"),
    ("0*x", "0"),
    ("x-x+1", "1"),
    ("(x+1)^2-x^2-2*x", "1"),
    ("a+b-b-a", "0"),
    ("(x-x+1)/2", "0.5"),
    ("x-x-3/4", r"-\frac{3}{4}"),
    (r"x-x+\sqrt{4}", "2"),
    ("(3*x-3*x+2)/6", "1/3"),
    ("x-x+0.10000000000000001", "0.10000000000000001"),
])
def test_constant_expressions_match_numbers_in_both_directions(expression, number):
    assert is_task_answer_correct({"question_type": "input", "answer": expression}, number)
    assert is_task_answer_correct({"question_type": "input", "answer": number}, expression)
    assert normalize_task_answer_for_compare({"question_type": "input"}, expression) == normalize_task_answer_for_compare(
        {"question_type": "input"}, number,
    )


@pytest.mark.parametrize(("expression", "number"), [
    ("x-x+1", "0"),
    ("x-x+1", "1.0000000000000001"),
    ("x-x+1/3", "0.3333333333333333"),
    ("x-x+1/2", "0.5000000000000001"),
    ("x+1", "1"),
    ("x^2", "0"),
    ("x-x+2", "-2"),
    ("x-x-2", "2"),
])
def test_different_values_and_variable_expressions_are_not_accepted(expression, number):
    assert not is_task_answer_correct({"question_type": "input", "answer": expression}, number)
    assert not is_task_answer_correct({"question_type": "input", "answer": number}, expression)


@pytest.mark.parametrize("expression", [
    "1/0", "0/(x-x)", "(x-x)/(x-x)", "0*(1/0)", r"x-x+\sqrt{2}",
    "cat-cat", "__import__('os')", "(x-x+2)^1000", "x-x+" + "1" * 300,
])
def test_invalid_unsupported_or_oversized_expressions_are_not_numeric_zero(expression):
    assert not is_task_answer_correct({"question_type": "input", "answer": "0"}, expression)


@pytest.mark.parametrize(("expression", "canonical"), [("x-x", "0"), ("x-x+1", "1"), ("(x-x+1)/2", "1/2")])
def test_algebra_canonical_form_uses_exact_numeric_representation_for_constants(expression, canonical):
    assert canonicalize_algebraic_expression(expression) == canonical
    assert canonicalize_algebraic_expression(canonical) == canonical


def test_constant_alias_is_compared_with_the_same_exact_rules():
    task = {"question_type": "input", "answer": "one", "accepted_answers": ["x-x+1"]}
    assert is_task_answer_correct(task, "1")
    assert not is_task_answer_correct(task, "2")


@pytest.mark.parametrize("question_type", ["mcq", "mcq6", "select"])
def test_written_choices_map_constant_values_without_changing_labels_or_order(question_type):
    multi = question_type != "mcq"
    options = [{"label": label, "text": text} for label, text in zip(
        "ABCDEF" if question_type == "mcq6" else "ABCD",
        ["x-x", "1", "(x-x+1)/2", "2", "3", "4"],
    )]
    task = {"question_type": question_type, "answer_mode": "written", "options": options,
            "answer": json.dumps(["A", "C"]) if multi else "A"}
    assert is_task_answer_correct(task, '["0", "0.5"]' if multi else "0")
    assert not is_task_answer_correct(task, '["0", "0.6"]' if multi else "1")
    if multi:
        assert is_task_answer_correct(task, '["0.5", "0"]') is (question_type == "mcq6")
    assert task["options"] == options


@pytest.mark.asyncio
@pytest.mark.parametrize("surface", ["module", "solo", "coop", "quiz", "preview"])
@pytest.mark.parametrize(("expected", "submitted"), [("x-x", "0"), ("(x-x+1)/2", "0.5")])
async def test_constant_answers_are_graded_consistently_across_routes(client, test_db, test_user, surface, expected, submitted):
    if surface == "module":
        task = await test_db.tasks.create_task("Simplify", expected, created_by=test_user["id"])
        response = client.post("/api/task/check", json={"email": test_user["email"], "task_id": task["id"], "answer": submitted})
        assert response.status_code == 200, response.text
        assert response.json()["correct"] is True
        assert (await test_db.tasks.get_task_by_id(task["id"]))["answer"] == expected
    elif surface in {"solo", "coop"}:
        trial = await test_db.trial_tests.create_trial_test("Constant answer", created_by=test_user["id"])
        task = await test_db.trial_tests.create_trial_test_task(trial["id"], "Simplify", expected)
        body = {"email": test_user["email"], "answers": {str(task["id"]): submitted}}
        if surface == "coop":
            session = await test_db.trial_test_coop.create_session(trial["id"], test_user["id"])
            await test_db.trial_test_coop.add_participant(session["id"], test_user["id"], "red")
            body["session_id"] = session["id"]
        path = f"/api/trial-tests/{trial['id']}/" + ("submit" if surface == "solo" else "coop/finish")
        response = client.post(path, json=body)
        assert response.status_code == 200, response.text
        assert response.json()["score"] == 1
        records = await test_db.trial_tests.get_user_trial_test_results(test_user["id"], trial["id"])
        assert json.loads(records[0]["answers"])[str(task["id"])]["correct_answer"] == expected
    elif surface == "quiz":
        quiz = await test_db.quizzes.create_quiz("Constant quiz", test_user["id"])
        question = await test_db.quizzes.add_question(quiz["id"], "Simplify", question_type="input", correct_answer=expected)
        session = await test_db.quizzes.create_session(quiz["id"], test_user["id"])
        player = await test_db.quizzes.join_session(session["id"], "Constant player")
        await test_db.quizzes.update_session_status(session["id"], "in_progress")
        await test_db.quizzes.activate_question(session["id"], player["participant_token"])
        response = client.post(f"/api/quiz-sessions/{session['id']}/answers", headers={
            "X-Quiz-Participant-Token": player["participant_token"],
        }, json={"participant_id": player["id"], "question_id": question["id"], "answer": submitted})
        assert response.status_code == 200, response.text
        assert response.json()["is_correct"] is True
    else:
        await test_db.users.set_admin(email=test_user["email"], is_admin=True)
        response = client.post("/api/admin/task-answer/preview-check", params={"email": test_user["email"]}, json={
            "task": {"question_type": "input", "answer": expected}, "user_answer": submitted,
        })
        assert response.status_code == 200, response.text
        assert response.json()["correct"] is True
