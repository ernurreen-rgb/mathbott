"""Guest result ownership and score-preserving practice."""
import asyncio
import pytest
from tests.test_quiz_security import make_game, production, signed  # noqa: F401
from utils.quiz import QuizError


async def finish_player(db, session, player, questions):
    sid, token = session['id'], player['participant_token']
    await db.quizzes.update_session_status(sid, 'in_progress')
    for index, question in enumerate(questions):
        await db.quizzes.activate_question(sid, token)
        await db.quizzes.record_answer(sid, player['id'], question['id'], 'wrong' if index == 0 else '4', token)
        await db.quizzes.activate_question(sid, token, True, question['id'])


@pytest.mark.asyncio
async def test_guest_claim_keeps_scores_answers_and_allows_account_only_review(client, test_db, test_user, production):
    _, questions, session, player = await make_game(test_db, test_user)
    await finish_player(test_db, session, player, questions)
    before = await test_db.quizzes.get_participant(session['id'], player['id'])
    claim_path = f"/api/quiz-sessions/{session['id']}/claim"
    headers = signed('POST', claim_path, email=test_user['email'])[1]
    headers['X-Quiz-Participant-Token'] = player['participant_token']
    assert client.post(claim_path, headers=headers).status_code == 200
    headers = signed('POST', claim_path, email=test_user['email'])[1]
    headers['X-Quiz-Participant-Token'] = player['participant_token']
    assert client.post(claim_path, headers=headers).status_code == 200
    after = await test_db.quizzes.get_participant(session['id'], player['id'])
    assert after['user_id'] == test_user['id']
    assert all(after[key] == before[key] for key in ('score', 'correct_count', 'total_answered', 'token_hash'))
    history = await test_db.quizzes.get_user_quiz_history(test_user['id'])
    assert len(history) == 1 and history[0]['participant_id'] == player['id']
    review_path = f"/api/quiz-sessions/{session['id']}/review"
    query = f"participant_id={player['id']}"
    review = client.get(review_path + '?' + query, headers=signed('GET', review_path, email=test_user['email'], query=query)[1])
    assert review.status_code == 200
    assert [item['is_correct'] for item in review.json()['items']] == [False, True]
    assert review.json()['items'][0]['question']['correct_answer'] == '4'
    assert 'token_hash' not in review.text


@pytest.mark.asyncio
async def test_cannot_claim_by_email_alone_or_transfer_an_owned_result(client, test_db, test_user, production):
    _, _, session, player = await make_game(test_db, test_user)
    path = f"/api/quiz-sessions/{session['id']}/claim"
    assert client.post(path + '?email=' + test_user['email']).status_code == 401
    assert client.post(path, headers=signed('POST', path, email=test_user['email'])[1]).status_code == 401
    await test_db.quizzes.claim_participant(session['id'], player['participant_token'], test_user['id'])
    other = await test_db.users.create_user_by_email('other-review@example.com')
    headers = signed('POST', path, email=other['email'])[1]
    headers['X-Quiz-Participant-Token'] = player['participant_token']
    assert client.post(path, headers=headers).status_code == 403
    join_path = '/api/quiz-sessions/join'
    payload = {'pin_code': session['pin_code'], 'nickname': 'Spoof', 'email': test_user['email']}
    body, headers = signed('POST', join_path, payload)
    joined = client.post(join_path, content=body, headers=headers)
    assert joined.status_code == 401
    payload.pop('email')
    body, headers = signed('POST', join_path, payload)
    joined = client.post(join_path, content=body, headers=headers)
    assert joined.status_code == 200
    participant = await test_db.quizzes.get_participant(session['id'], joined.json()['participant']['id'])
    assert participant['user_id'] is None


@pytest.mark.asyncio
async def test_guest_review_requires_finished_game_and_only_returns_own_answers(client, test_db, test_user, production):
    _, questions, session, player = await make_game(test_db, test_user)
    other = await test_db.quizzes.join_session(session['id'], 'Other guest')
    path = f"/api/quiz-sessions/{session['id']}/review"
    headers = {'X-Quiz-Participant-Token': player['participant_token']}
    assert client.get(path, headers=headers).status_code == 409
    await finish_player(test_db, session, player, questions)
    assert client.get(path).status_code == 401
    assert client.get(path, params={'participant_id': player['id']}, headers={'X-Quiz-Participant-Token': other['participant_token']}).status_code == 401
    response = client.get(path, headers=headers)
    assert response.status_code == 200
    assert response.json()['participant']['id'] == player['id']
    outsider = await test_db.users.create_user_by_email('outsider-review@example.com')
    query = f"participant_id={player['id']}"
    assert client.get(path + '?' + query, headers=signed('GET', path, email=outsider['email'], query=query)[1]).status_code == 403


@pytest.mark.asyncio
async def test_practice_uses_snapshot_math_equivalence_and_never_rewrites_game(client, test_db, test_user):
    quiz, questions, session, player = await make_game(test_db, test_user)
    await finish_player(test_db, session, player, questions)
    before = await test_db.quizzes.get_participant(session['id'], player['id'])
    original = await test_db.quizzes.get_participant_answer(session['id'], player['id'], questions[0]['id'])
    await test_db.quizzes.update_question(questions[0]['id'], correct_answer='999')
    path = f"/api/quiz-sessions/{session['id']}/review/answers"
    headers = {'X-Quiz-Participant-Token': player['participant_token']}
    for answer, expected in [('5', False), ('2+2', True), ('4', True)]:
        response = client.post(path, json={'question_id': questions[0]['id'], 'answer': answer}, headers=headers)
        assert response.status_code == 200
        assert response.json()['is_correct'] is expected
        assert response.json()['correct_answer'] == '4'
    after = await test_db.quizzes.get_participant(session['id'], player['id'])
    assert after == before
    assert await test_db.quizzes.get_participant_answer(session['id'], player['id'], questions[0]['id']) == original
    unrelated = await test_db.quizzes.add_question(quiz['id'], 'New question', correct_answer='4')
    assert client.post(path, json={'question_id': unrelated['id'], 'answer': '4'}, headers=headers).status_code == 404


@pytest.mark.asyncio
async def test_concurrent_claims_have_one_owner(test_db, test_user):
    _, _, session, player = await make_game(test_db, test_user)
    other = await test_db.users.create_user_by_email('race-review@example.com')
    results = await asyncio.gather(*[
        test_db.quizzes.claim_participant(session['id'], player['participant_token'], user_id)
        for user_id in (test_user['id'], other['id'])
    ], return_exceptions=True)
    assert sum(isinstance(result, dict) for result in results) == 1
    assert sum(isinstance(result, QuizError) for result in results) == 1


@pytest.mark.asyncio
async def test_signed_rejoin_links_guest_and_account_switch_guard_rejects_stale_claim(client, test_db, test_user, production):
    _, _, session, player = await make_game(test_db, test_user)
    path = '/api/quiz-sessions/join'
    payload = {'pin_code': session['pin_code'], 'nickname': 'Guest', 'participant_token': player['participant_token']}
    body, headers = signed('POST', path, payload, test_user['email'])
    assert client.post(path, content=body, headers=headers).status_code == 200
    linked = await test_db.quizzes.get_participant(session['id'], player['id'])
    assert linked['user_id'] == test_user['id']
    another_guest = await test_db.quizzes.join_session(session['id'], 'Unclaimed')
    path = f"/api/quiz-sessions/{session['id']}/claim"
    query = 'expected_email=old%40example.com'
    headers = signed('POST', path, email=test_user['email'], query=query)[1]
    headers['X-Quiz-Participant-Token'] = another_guest['participant_token']
    assert client.post(path + '?' + query, headers=headers).status_code == 403
    assert (await test_db.quizzes.get_participant(session['id'], another_guest['id']))['user_id'] is None
