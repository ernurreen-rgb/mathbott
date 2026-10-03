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
        json={"pin_code": pin_code, "nickname": "Алихан", "avatar_color": "#ef4444"},
    )
    assert join1_resp.status_code == 200
    p1 = join1_resp.json()["participant"]

    join2_resp = client.post(
        "/api/quiz-sessions/join",
        json={"pin_code": pin_code, "nickname": "Аружан", "email": user_email},
    )
    assert join2_resp.status_code == 200
    p2 = join2_resp.json()["participant"]

    # 3.5. Premature answer rejection: answering while in "lobby" must return 400
    lobby_ans_resp = client.post(
        f"/api/quiz-sessions/{session_id}/answers",
        json={
            "participant_id": p1["id"],
            "question_id": q1["id"],
            "answer": "A",
            "time_taken_seconds": 5.0,
        },
    )
    assert lobby_ans_resp.status_code == 400
    assert "not active" in str(lobby_ans_resp.json())

    # 4. Host starts the game
    start_resp = client.post(
        f"/api/quiz-sessions/{session_id}/start",
        params={"email": user_email},
    )
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "in_progress"

    # 5. Player fetches questions: verify correct_answer is hidden for security!
    play_questions_resp = client.get(f"/api/quiz-sessions/{session_id}/questions?is_host=false")
    assert play_questions_resp.status_code == 200
    play_questions = play_questions_resp.json()
    assert len(play_questions) == 2
    for pq in play_questions:
        assert "correct_answer" not in pq
        assert "accepted_answers" not in pq

    # 6. Player 1 answers Q1 correctly and fast (time_taken = 5 sec out of 30 sec)
    ans1_resp = client.post(
        f"/api/quiz-sessions/{session_id}/answers",
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
    ans3_resp = client.post(
        f"/api/quiz-sessions/{session_id}/answers",
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
    lb_resp = client.get(f"/api/quiz-sessions/{session_id}/leaderboard")
    assert lb_resp.status_code == 200
    leaderboard = lb_resp.json()
    assert leaderboard[0]["nickname"] == "Алихан"
    assert leaderboard[0]["score"] > 1700
    assert leaderboard[1]["nickname"] == "Аружан"

    # 10. Host finishes game
    finish_resp = client.post(
        f"/api/quiz-sessions/{session_id}/finish",
        params={"email": user_email},
    )
    assert finish_resp.status_code == 200
    stats = finish_resp.json()
    assert stats["total_players"] == 2
    assert stats["podium"][0]["nickname"] == "Алихан"
