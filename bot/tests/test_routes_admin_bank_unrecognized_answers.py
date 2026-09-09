"""Admin queue for repeated unrecognized written answers."""
import pytest


@pytest.mark.asyncio
async def test_unrecognized_answers_aggregate_and_can_be_accepted(client, test_db):
    admin = await test_db.users.create_user_by_email("admin.unrecognized@example.com")
    await test_db.users.set_admin(email=admin["email"], is_admin=True)
    student = await test_db.users.create_user_by_email("student.unrecognized@example.com")

    module = await test_db.curriculum.create_module("Answer review module", sort_order=0)
    section = await test_db.curriculum.create_section(module["id"], "Answer review section", sort_order=0)

    bank_task = await test_db.bank_tasks.create_task(
        text="Solve x + 1 = 3",
        answer="x=2",
        question_type="input",
        answer_mode="written",
        difficulty="A",
        created_by=admin["id"],
    )
    lesson_task = await test_db.create_task_in_section(
        section_id=section["id"],
        text=bank_task["text"],
        answer=bank_task["answer"],
        question_type="input",
        created_by=admin["id"],
        bank_task_id=bank_task["id"],
        sort_order=0,
    )
    await test_db.record_solution(student["id"], lesson_task["id"], "x=3", False)
    await test_db.record_solution(student["id"], lesson_task["id"], " x = 3 ", False)

    trial_test = await test_db.trial_tests.create_trial_test(
        "Answer review trial",
        sort_order=0,
        created_by=admin["id"],
    )
    trial_task = await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text=bank_task["text"],
        answer=bank_task["answer"],
        question_type="input",
        created_by=admin["id"],
        bank_task_id=bank_task["id"],
        sort_order=0,
    )
    await test_db.trial_tests.save_trial_test_result(
        user_id=student["id"],
        trial_test_id=trial_test["id"],
        score=0,
        total=1,
        percentage=0,
        answers={
            trial_task["id"]: {
                "answer": "x=3",
                "correct": False,
                "correct_answer": bank_task["answer"],
            }
        },
    )

    response = client.get(
        "/api/admin/bank/unrecognized-answers",
        params={"email": admin["email"], "min_count": 2},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["bank_task_id"] == bank_task["id"]
    assert item["student_answer"].replace(" ", "") == "x=3"
    assert item["occurrences"] == 3
    assert item["students_count"] == 1
    assert set(item["sources"]) == {"lesson", "trial_test"}

    accept_response = client.post(
        f"/api/admin/bank/tasks/{bank_task['id']}/accepted-answers",
        json={
            "email": admin["email"],
            "answer": item["student_answer"],
            "expected_current_version": item["current_version"],
        },
    )
    assert accept_response.status_code == 200
    accepted = accept_response.json()
    assert accepted["added"] is True
    assert item["student_answer"] in accepted["task"]["accepted_answers"]

    after_response = client.get(
        "/api/admin/bank/unrecognized-answers",
        params={"email": admin["email"], "min_count": 1},
    )
    assert after_response.status_code == 200
    assert after_response.json()["items"] == []


@pytest.mark.asyncio
async def test_unrecognized_answers_exclude_choice_tasks_and_currently_valid_answers(client, test_db):
    admin = await test_db.users.create_user_by_email("admin.unrecognized.filters@example.com")
    await test_db.users.set_admin(email=admin["email"], is_admin=True)
    student = await test_db.users.create_user_by_email("student.unrecognized.filters@example.com")
    module = await test_db.curriculum.create_module("Answer filters module", sort_order=0)
    section = await test_db.curriculum.create_section(module["id"], "Answer filters section", sort_order=0)

    choice_bank_task = await test_db.bank_tasks.create_task(
        text="Choose one",
        answer="A",
        question_type="mcq",
        answer_mode="choices",
        difficulty="A",
        options=[
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        created_by=admin["id"],
    )
    choice_task = await test_db.create_task_in_section(
        section_id=section["id"],
        text=choice_bank_task["text"],
        answer=choice_bank_task["answer"],
        question_type="mcq",
        options=choice_bank_task["options"],
        created_by=admin["id"],
        bank_task_id=choice_bank_task["id"],
        sort_order=0,
    )
    await test_db.record_solution(student["id"], choice_task["id"], "B", False)

    written_bank_task = await test_db.bank_tasks.create_task(
        text="Write one half",
        answer=r"\frac{1}{2}",
        question_type="input",
        answer_mode="written",
        difficulty="A",
        created_by=admin["id"],
    )
    written_task = await test_db.create_task_in_section(
        section_id=section["id"],
        text=written_bank_task["text"],
        answer=written_bank_task["answer"],
        question_type="input",
        created_by=admin["id"],
        bank_task_id=written_bank_task["id"],
        sort_order=1,
    )
    # Simulate an old row marked incorrect before the current equivalence rules existed.
    await test_db.record_solution(student["id"], written_task["id"], "0.5", False)

    response = client.get(
        "/api/admin/bank/unrecognized-answers",
        params={"email": admin["email"], "min_count": 1},
    )
    assert response.status_code == 200
    assert response.json()["items"] == []
