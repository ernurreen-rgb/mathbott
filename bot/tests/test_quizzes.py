"""
Tests for Quizzes and Live Game Session (Quizizz-like service)
"""
import pytest


@pytest.mark.asyncio
async def test_quiz_crud(client, test_db, test_user):
    user_email = test_user["email"]

    # 1. Create Quiz
    create_resp = client.post(
        "/api/quizzes",
        json={"title": "Математикалық логика", "description": "Сынақ квиз", "is_public": True},
        params={"email": user_email},
    )
    assert create_resp.status_code == 200, create_resp.text
    quiz = create_resp.json()
    assert quiz["title"] == "Математикалық логика"
    assert quiz["created_by"] == test_user["id"]
    quiz_id = quiz["id"]

    # 2. Get Quiz
    get_resp = client.get(f"/api/quizzes/{quiz_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == quiz_id

    # 3. List Quizzes
    list_resp = client.get("/api/quizzes")
    assert list_resp.status_code == 200
    quizzes = list_resp.json()
    assert any(q["id"] == quiz_id for q in quizzes)

    # 4. Update Quiz
    update_resp = client.put(
        f"/api/quizzes/{quiz_id}",
        json={"title": "Жаңартылған квиз"},
        params={"email": user_email},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "Жаңартылған квиз"

    # 5. Delete Quiz
    del_resp = client.delete(f"/api/quizzes/{quiz_id}", params={"email": user_email})
    assert del_resp.status_code == 200
    assert client.get(f"/api/quizzes/{quiz_id}").status_code == 404


@pytest.mark.asyncio
async def test_quiz_questions_crud(client, test_db, test_user):
    user_email = test_user["email"]
    quiz = await test_db.quizzes.create_quiz(
        title="Тест сұрақтары", created_by=test_user["id"]
    )
    quiz_id = quiz["id"]

    # 1. Add MCQ Question
    q1_resp = client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "question_text": "2 + 2 нешеге тең?",
            "question_type": "mcq",
            "options": [
                {"id": "A", "text": "3", "is_correct": False},
                {"id": "B", "text": "4", "is_correct": True},
                {"id": "C", "text": "5", "is_correct": False},
                {"id": "D", "text": "6", "is_correct": False},
            ],
            "correct_answer": "B",
            "time_limit_seconds": 20,
            "points": 1000,
        },
        params={"email": user_email},
    )
    assert q1_resp.status_code == 200, q1_resp.text
    q1 = q1_resp.json()
    assert q1["question_text"] == "2 + 2 нешеге тең?"
    assert len(q1["options"]) == 4

    # 2. Add Math Formula Question
    q2_resp = client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "question_text": "x^2 - 1 өрнегін көбейткіштерге жіктеңіз",
            "question_type": "input",
            "correct_answer": "(x-1)(x+1)",
            "time_limit_seconds": 30,
            "points": 1000,
        },
        params={"email": user_email},
    )
    assert q2_resp.status_code == 200

    # 3. Get Questions List
    list_resp = client.get(f"/api/quizzes/{quiz_id}/questions")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 2


@pytest.mark.asyncio
async def test_quiz_live_session_gameplay(client, test_db, test_user):
    user_email = test_user["email"]

    # Setup quiz with 2 questions
    quiz = await test_db.quizzes.create_quiz(title="Quizizz Live Game", created_by=test_user["id"])
    q1 = await test_db.quizzes.add_question(
        quiz_id=quiz["id"],
        question_text="2 * 3 = ?",
        question_type="mcq",
        options=[
            {"id": "A", "text": "6", "is_correct": True},
            {"id": "B", "text": "5", "is_correct": False},
        ],
        correct_answer="A",
        time_limit_seconds=30,
        points=1000,
    )
    q2 = await test_db.quizzes.add_question(
        quiz_id=quiz["id"],
        question_text="\\frac{1}{2} ондық бөлшек түрінде",
        question_type="input",
        correct_answer="0.5",
        time_limit_seconds=30,
        points=1000,
    )

    # 1. Host creates game room
    create_session_resp = client.post(
        "/api/quiz-sessions",
        json={"quiz_id": quiz["id"]},
        params={"email": user_email},
    )
    assert create_session_resp.status_code == 200, create_session_resp.text
    session = create_session_resp.json()
    session_id = session["id"]
    pin_code = session["pin_code"]
    assert len(pin_code) == 6

    # 2. Lookup session by PIN
    pin_lookup = client.get(f"/api/quiz-sessions/pin/{pin_code}")
    assert pin_lookup.status_code == 200
    assert pin_lookup.json()["id"] == session_id

    # 3. Two players join (Player 1 guest, Player 2 registered)
    join1_resp = client.post(
        "/api/quiz-sessions/join",
        json={"pin_code": pin_code, "nickname": "Алихан", "avatar_color": "#ef4444:fox"},
    )
    assert join1_resp.status_code == 200
    p1 = join1_resp.json()["participant"]
    assert p1["avatar_color"] == "#ef4444:fox"
    h1 = {"X-Quiz-Participant-Token": join1_resp.json()["participant_token"]}

    # Player 1 updates avatar in lobby
    avatar_resp = client.patch(
        f"/api/quiz-sessions/{session_id}/avatar",
        headers=h1,
        json={"avatar_color": "#8b5cf6:robot"},
    )
    assert avatar_resp.status_code == 200
    assert avatar_resp.json()["avatar_color"] == "#8b5cf6:robot"

    join2_resp = client.post(
        "/api/quiz-sessions/join",
        json={"pin_code": pin_code, "nickname": "Аружан", "email": user_email},
    )
    assert join2_resp.status_code == 200
    p2 = join2_resp.json()["participant"]
    assert ":" in p2["avatar_color"]
    h2 = {"X-Quiz-Participant-Token": join2_resp.json()["participant_token"]}

    # 3.5. Premature answer rejection: answering while in "lobby" must return 400
    lobby_ans_resp = client.post(
        f"/api/quiz-sessions/{session_id}/answers",
        headers=h1,
        json={
            "participant_id": p1["id"],
            "question_id": q1["id"],
            "answer": "A",
            "time_taken_seconds": 5.0,
        },
    )
    assert lobby_ans_resp.status_code == 409
    assert "not active" in str(lobby_ans_resp.json())

    # 4. Host starts the game
    start_resp = client.post(
        f"/api/quiz-sessions/{session_id}/start",
        params={"email": user_email},
    )
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "in_progress"
    for player_headers in (h1, h2):
        assert client.post(f"/api/quiz-sessions/{session_id}/current-question", headers=player_headers).status_code == 200

    # 5. Player fetches questions: verify correct_answer is hidden for security!
    play_questions_resp = client.get(f"/api/quiz-sessions/{session_id}/questions?is_host=false", headers=h1)
    assert play_questions_resp.status_code == 200
    play_questions = play_questions_resp.json()
    assert len(play_questions) == 1
    for pq in play_questions:
        assert "correct_answer" not in pq
        assert "accepted_answers" not in pq

    # 6. Player 1 answers Q1 correctly and fast (time_taken = 5 sec out of 30 sec)
    ans1_resp = client.post(
        f"/api/quiz-sessions/{session_id}/answers",
        headers=h1,
        json={
            "participant_id": p1["id"],
            "question_id": q1["id"],
            "answer": "A",
            "time_taken_seconds": 5.0,
        },
    )
    assert ans1_resp.status_code == 200
    ans1_data = ans1_resp.json()
    assert ans1_data["is_correct"] is True
    # Fast answer: ~1000 * (0.5 + 0.5 * (25/30)) = ~916 pts
    assert ans1_data["points_awarded"] > 850
    assert ans1_data["streak"] == 1
    score_after_q1 = ans1_data["total_score"]

    # 6.5. Double-submission protection: submitting Q1 again must not increase score
    ans1_duplicate = client.post(
        f"/api/quiz-sessions/{session_id}/answers",
        headers=h1,
        json={
            "participant_id": p1["id"],
            "question_id": q1["id"],
            "answer": "A",
            "time_taken_seconds": 1.0,
        },
    )
    assert ans1_duplicate.status_code == 200
    assert ans1_duplicate.json()["total_score"] == score_after_q1

    # 7. Player 2 answers Q1 incorrectly
    ans2_resp = client.post(
        f"/api/quiz-sessions/{session_id}/answers",
        headers=h2,
        json={
            "participant_id": p2["id"],
            "question_id": q1["id"],
            "answer": "B",
            "time_taken_seconds": 10.0,
        },
    )
    assert ans2_resp.status_code == 200
    ans2_data = ans2_resp.json()
    assert ans2_data["is_correct"] is False
    assert ans2_data["points_awarded"] == 0

    # 8. Player 1 answers Q2 (Math formula: entered "1/2", correct is "0.5")
    # Math engine should recognize 1/2 == 0.5!
    assert client.post(f"/api/quiz-sessions/{session_id}/next", headers=h1, json={"question_id": q1["id"]}).status_code == 200
    ans3_resp = client.post(
        f"/api/quiz-sessions/{session_id}/answers",
        headers=h1,
        json={
            "participant_id": p1["id"],
            "question_id": q2["id"],
            "answer": "1/2",
            "time_taken_seconds": 2.0,
        },
    )
    assert ans3_resp.status_code == 200
    assert ans3_resp.json()["is_correct"] is True
    assert ans3_resp.json()["streak"] == 2  # Streak increased!

    # 9. Verify Leaderboard
    lb_resp = client.get(f"/api/quiz-sessions/{session_id}/leaderboard", headers=h1)
    assert lb_resp.status_code == 200
    leaderboard = lb_resp.json()
    assert leaderboard[0]["nickname"] == "Алихан"
    assert leaderboard[0]["score"] > 1700
    assert leaderboard[1]["nickname"] == "Аружан"

    # 9b. Participants cannot read full session results while game is in progress,
    # and unauthenticated guests cannot list quiz sessions / PIN codes.
    midgame_results_resp = client.get(f"/api/quiz-sessions/{session_id}/results", headers=h1)
    assert midgame_results_resp.status_code == 403

    guest_sessions_resp = client.get(f"/api/quizzes/{quiz['id']}/sessions")
    assert guest_sessions_resp.status_code == 200
    assert guest_sessions_resp.json() == []

    # 10. Host finishes game
    finish_resp = client.post(
        f"/api/quiz-sessions/{session_id}/finish",
        params={"email": user_email},
    )
    assert finish_resp.status_code == 200
    stats = finish_resp.json()
    assert stats["total_players"] == 2
    assert stats["podium"][0]["nickname"] == "Алихан"

    # 11. Quiz sessions list endpoint (only visible to the session host / admin)
    sessions_resp = client.get(
        f"/api/quizzes/{quiz['id']}/sessions",
        params={"email": user_email},
    )
    assert sessions_resp.status_code == 200
    sessions_list = sessions_resp.json()
    assert len(sessions_list) == 1
    assert sessions_list[0]["id"] == session_id
    assert sessions_list[0]["participant_count"] == 2
    assert sessions_list[0]["status"] == "finished"
    assert sessions_list[0]["avg_score"] > 800
    assert len(sessions_list[0]["top_participants"]) == 2

    stranger = await test_db.users.create_user_by_email("stranger@example.com")
    stranger_sessions_resp = client.get(
        f"/api/quizzes/{quiz['id']}/sessions",
        params={"email": stranger["email"]},
    )
    assert stranger_sessions_resp.status_code == 200
    assert stranger_sessions_resp.json() == []

    # 12. Full session results endpoint (host sees all answers; participant only sees own answers)
    results_resp = client.get(
        f"/api/quiz-sessions/{session_id}/results",
        params={"email": user_email},
    )
    assert results_resp.status_code == 200
    res_data = results_resp.json()
    assert res_data["total_players"] == 2
    assert res_data["participants"][0]["nickname"] == "Алихан"
    assert res_data["participants"][0]["rank"] == 1
    assert len(res_data["participants"][0]["answers"]) == 2
    assert res_data["participants"][1]["nickname"] == "Аружан"
    assert res_data["participants"][1]["rank"] == 2

    p1_results_resp = client.get(f"/api/quiz-sessions/{session_id}/results", headers=h1)
    assert p1_results_resp.status_code == 200
    p1_res_data = p1_results_resp.json()
    assert len(p1_res_data["participants"][0]["answers"]) == 2
    assert p1_res_data["participants"][1]["answers"] == []

    # 13. User quiz history endpoint (Player 2 was registered with user_email)
    user_hist_resp = client.get(
        "/api/quiz-sessions/user/history",
        params={"email": user_email},
    )
    assert user_hist_resp.status_code == 200
    user_history = user_hist_resp.json()
    assert len(user_history) == 1
    assert user_history[0]["quiz_title"] == "Quizizz Live Game"
    assert user_history[0]["nickname"] == "Аружан"
    assert user_history[0]["rank"] == 2


@pytest.mark.asyncio
async def test_quiz_public_private_visibility(client, test_db, test_user):
    owner_email = test_user["email"]

    # 1. Create a private quiz
    create_resp = client.post(
        "/api/quizzes",
        json={"title": "Жеке квиз", "is_public": False},
        params={"email": owner_email},
    )
    assert create_resp.status_code == 200
    quiz = create_resp.json()
    assert quiz["is_public"] is False
    quiz_id = quiz["id"]

    # 2. Public catalog must NOT include the private quiz
    public_list = client.get("/api/quizzes").json()
    assert not any(q["id"] == quiz_id for q in public_list)

    # 3. Owner's list ("my_only") MUST include the private quiz
    my_list = client.get("/api/quizzes", params={"my_only": "true", "email": owner_email}).json()
    assert any(q["id"] == quiz_id for q in my_list)

    # 4. Filter my quizzes by is_public
    my_private = client.get("/api/quizzes", params={"my_only": "true", "is_public": "false", "email": owner_email}).json()
    assert any(q["id"] == quiz_id for q in my_private)

    my_public = client.get("/api/quizzes", params={"my_only": "true", "is_public": "true", "email": owner_email}).json()
    assert not any(q["id"] == quiz_id for q in my_public)

    # 5. Non-owner (no identity or other user) cannot view the private quiz
    assert client.get(f"/api/quizzes/{quiz_id}").status_code == 404

    # 6. Owner CAN view their private quiz
    owner_get = client.get(f"/api/quizzes/{quiz_id}", params={"email": owner_email})
    assert owner_get.status_code == 200
    assert owner_get.json()["is_public"] is False

    # 7. Owner can change private quiz to public
    update_resp = client.put(
        f"/api/quizzes/{quiz_id}",
        json={"is_public": True},
        params={"email": owner_email},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["is_public"] is True

    # Now it appears in public catalog
    public_list_after = client.get("/api/quizzes").json()
    assert any(q["id"] == quiz_id for q in public_list_after)

    # 8. Owner can change it back to private
    update_back = client.put(
        f"/api/quizzes/{quiz_id}",
        json={"is_public": False},
        params={"email": owner_email},
    )
    assert update_back.status_code == 200
    assert update_back.json()["is_public"] is False

    # Hidden from public catalog again
    public_list_final = client.get("/api/quizzes").json()
    assert not any(q["id"] == quiz_id for q in public_list_final)


@pytest.mark.asyncio
async def test_quiz_update_with_questions_and_fork(client, test_db, test_user):
    user_email = test_user["email"]

    # 1. Create other user
    other_user = await test_db.users.create_user_by_email("other@example.com")

    # 2. Create quiz with questions by user 1
    create_resp = client.post(
        "/api/quizzes",
        json={
            "title": "Бастапқы квиз",
            "description": "Сипаттамасы",
            "is_public": True,
            "questions": [
                {
                    "question_text": "1 + 1 нешеге тең?",
                    "question_type": "mcq",
                    "options": [
                        {"id": "A", "text": "2", "is_correct": True},
                        {"id": "B", "text": "3", "is_correct": False},
                        {"id": "C", "text": "0", "is_correct": False},
                        {"id": "D", "text": "1", "is_correct": False},
                    ],
                    "correct_answer": "A",
                    "time_limit_seconds": 30,
                    "points": 1000,
                }
            ],
        },
        params={"email": user_email},
    )
    assert create_resp.status_code == 200
    quiz_id = create_resp.json()["id"]

    # 3. Update quiz with modified title and replaced questions
    update_resp = client.put(
        f"/api/quizzes/{quiz_id}",
        json={
            "title": "Жаңартылған квиз тақырыбы",
            "questions": [
                {
                    "question_text": "5 * 5 нешеге тең?",
                    "question_type": "mcq",
                    "options": [
                        {"id": "A", "text": "25", "is_correct": True},
                        {"id": "B", "text": "20", "is_correct": False},
                        {"id": "C", "text": "0", "is_correct": False},
                        {"id": "D", "text": "1", "is_correct": False},
                    ],
                    "correct_answer": "A",
                    "time_limit_seconds": 25,
                    "points": 1200,
                },
                {
                    "question_text": "10 / 2",
                    "question_type": "input",
                    "correct_answer": "5",
                    "time_limit_seconds": 15,
                    "points": 800,
                },
            ],
        },
        params={"email": user_email},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "Жаңартылған квиз тақырыбы"

    questions_resp = client.get(f"/api/quizzes/{quiz_id}/questions", params={"email": user_email})
    assert questions_resp.status_code == 200
    updated_questions = questions_resp.json()
    assert len(updated_questions) == 2
    assert updated_questions[0]["question_text"] == "5 * 5 нешеге тең?"
    assert updated_questions[0]["correct_answer"] == "A"
    assert updated_questions[1]["question_text"] == "10 / 2"
    assert updated_questions[1]["correct_answer"] == "5"

    # 4. Other user forks the public quiz
    fork_resp = client.post(
        f"/api/quizzes/{quiz_id}/fork",
        params={"email": other_user["email"]},
    )
    assert fork_resp.status_code == 200
    cloned_quiz = fork_resp.json()
    assert cloned_quiz["created_by"] == other_user["id"]
    assert cloned_quiz["id"] != quiz_id
    assert "Көшірме" in cloned_quiz["title"]
    assert cloned_quiz["can_manage"] is True

    # Other user can see full questions and answers in their cloned copy
    cloned_questions = client.get(
        f"/api/quizzes/{cloned_quiz['id']}/questions",
        params={"email": other_user["email"]},
    ).json()
    assert len(cloned_questions) == 2
    assert cloned_questions[0]["correct_answer"] == "A"
    assert cloned_questions[1]["correct_answer"] == "5"

    # 5. Non-owner cannot update the original quiz
    forbidden_update = client.put(
        f"/api/quizzes/{quiz_id}",
        json={"title": "Бөтен өзгерту"},
        params={"email": other_user["email"]},
    )
    assert forbidden_update.status_code == 403

    # 6. If quiz is private, other user cannot fork it
    client.put(f"/api/quizzes/{quiz_id}", json={"is_public": False}, params={"email": user_email})
    fork_private_resp = client.post(
        f"/api/quizzes/{quiz_id}/fork",
        params={"email": other_user["email"]},
    )
    assert fork_private_resp.status_code == 403

