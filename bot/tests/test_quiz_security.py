"""Quiz capabilities, immutable questions and transaction regressions."""
import asyncio
import json
import sqlite3

import pytest
from httpx2 import AsyncClient, ASGITransport
from starlette.websockets import WebSocketDisconnect
from tests.route_helpers import _proxy_headers
from utils.quiz import QuizError

SECRET = 'quiz-test-proxy-secret-not-for-deployment'


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setenv('ENVIRONMENT', 'production')
    monkeypatch.setenv('INTERNAL_PROXY_SHARED_SECRET', SECRET)


def signed(method, path, payload=None, email='', query=''):
    body = json.dumps(payload) if payload is not None else ''
    content_type = 'application/json' if payload is not None else ''
    headers = _proxy_headers(method, path, query, email, SECRET, body=body, content_type=content_type)
    if content_type:
        headers['Content-Type'] = content_type
    return body, headers


async def make_game(db, user, private=False, count=2):
    quiz = await db.quizzes.create_quiz('Quiz', user['id'], is_public=not private)
    questions = [await db.quizzes.add_question(quiz['id'], f'Question {i}', question_type='input',
        correct_answer='4', sort_order=i, time_limit_seconds=30) for i in range(count)]
    session = await db.quizzes.create_session(quiz['id'], user['id'])
    participant = await db.quizzes.join_session(session['id'], 'Guest')
    return quiz, questions, session, participant


@pytest.mark.asyncio
async def test_private_catalog_and_hosting_enforce_identity(client, test_db, test_user, production):
    quiz, _, session, player = await make_game(test_db, test_user, private=True)
    outsider = await test_db.users.create_user_by_email('outside@example.com')
    for suffix in ('', '/questions'):
        path = f"/api/quizzes/{quiz['id']}{suffix}"
        assert client.get(path).status_code == 404
        assert client.get(path, headers=signed('GET', path, email=outsider['email'])[1]).status_code == 404
        assert client.get(path, headers=signed('GET', path, email=test_user['email'])[1]).status_code == 200
    path = '/api/quiz-sessions'
    body, headers = signed('POST', path, {'quiz_id': quiz['id']}, outsider['email'])
    assert client.post(path, content=body, headers=headers).status_code == 403
    path = f"/api/quiz-sessions/{session['id']}/questions"
    assert client.get(path + '?is_host=true').status_code == 403
    assert client.get(path + '?is_host=true', headers={'X-Quiz-Participant-Token': player['participant_token']}).status_code == 403
    response = client.get(path + '?is_host=true', headers=signed('GET', path, email=test_user['email'], query='is_host=true')[1])
    assert response.json()[0]['correct_answer'] == '4'


@pytest.mark.asyncio
async def test_public_quiz_preview_strips_keys_but_other_user_can_host(client, test_db, test_user, production):
    quiz, questions, _, _ = await make_game(test_db, test_user)
    await test_db.quizzes.update_question(questions[0]['id'], options=[{'id': 'A', 'text': '4', 'is_correct': True, 'answer': 'hidden'}])
    response = client.get(f"/api/quizzes/{quiz['id']}/questions")
    assert response.status_code == 200
    assert 'correct_answer' not in response.json()[0]
    assert response.json()[0]['options'] == [{'id': 'A', 'text': '4'}]
    outsider = await test_db.users.create_user_by_email('teacher@example.com')
    path = '/api/quiz-sessions'
    body, headers = signed('POST', path, {'quiz_id': quiz['id']}, outsider['email'])
    assert client.post(path, content=body, headers=headers).status_code == 200


@pytest.mark.asyncio
async def test_capability_is_required_and_never_public(client, test_db, test_user, production):
    _, questions, session, player = await make_game(test_db, test_user)
    await test_db.quizzes.update_session_status(session['id'], 'in_progress')
    await test_db.quizzes.activate_question(session['id'], player['participant_token'])
    other = await test_db.quizzes.join_session(session['id'], 'Other')
    path = f"/api/quiz-sessions/{session['id']}/answers"
    payload = {'participant_id': player['id'], 'question_id': questions[0]['id'], 'answer': '4', 'time_taken_seconds': 0}
    for credential in ('', other['participant_token']):
        body, headers = signed('POST', path, payload)
        headers['X-Quiz-Participant-Token'] = credential
        assert client.post(path, content=body, headers=headers).status_code == 401
    for suffix in ('', '/leaderboard', '/stats', '/progress'):
        response = client.get(f"/api/quiz-sessions/{session['id']}{suffix}")
        assert response.status_code == 401
    private_headers = {'X-Quiz-Participant-Token': player['participant_token']}
    response = client.get(f"/api/quiz-sessions/{session['id']}", headers=private_headers)
    assert response.status_code == 200
    assert 'token_hash' not in response.text and player['participant_token'] not in response.text
    assert 'no-store' in response.headers['cache-control']
    with pytest.raises(QuizError):
        await test_db.quizzes.join_session(session['id'], 'Guest')
    resumed = await test_db.quizzes.join_session(session['id'], 'Guest', participant_token=player['participant_token'])
    assert resumed['id'] == player['id']


@pytest.mark.asyncio
async def test_completion_is_scoped_and_requires_all_answers(test_db, test_user):
    _, questions, session, player = await make_game(test_db, test_user)
    _, _, other_session, _ = await make_game(test_db, test_user)
    with pytest.raises(QuizError):
        await test_db.quizzes.set_participant_finished(other_session['id'], player['id'], player['participant_token'])
    with pytest.raises(QuizError):
        await test_db.quizzes.set_participant_finished(session['id'], player['id'], player['participant_token'])
    assert not (await test_db.quizzes.get_participant(session['id'], player['id']))['is_finished']


@pytest.mark.asyncio
async def test_simultaneous_answers_score_once_and_retries_survive_finish(client, test_db, test_user):
    _, questions, session, player = await make_game(test_db, test_user)
    await test_db.quizzes.update_session_status(session['id'], 'in_progress')
    await test_db.quizzes.activate_question(session['id'], player['participant_token'])
    payload = {'participant_id': player['id'], 'question_id': questions[0]['id'], 'answer': '4'}
    url = f"/api/quiz-sessions/{session['id']}/answers"
    headers = {'X-Quiz-Participant-Token': player['participant_token']}
    async with AsyncClient(transport=ASGITransport(app=client.app), base_url='http://testserver') as http:
        responses = await asyncio.gather(*[http.post(url, json=payload, headers=headers) for _ in range(4)])
    assert all(r.status_code == 200 for r in responses)
    assert len({r.json()['points_awarded'] for r in responses}) == 1
    state = await test_db.quizzes.get_participant(session['id'], player['id'])
    assert state['total_answered'] == state['correct_count'] == state['streak'] == 1
    assert state['score'] == responses[0].json()['points_awarded']
    await test_db.quizzes.update_session_status(session['id'], 'finished')
    retry = client.post(url, json={**payload, 'answer': 'wrong'}, headers=headers)
    assert retry.status_code == 200 and retry.json()['is_correct'] is True
    assert retry.json()['total_score'] == state['score']


@pytest.mark.asyncio
async def test_finishing_wins_over_pending_write(client, test_db, test_user, monkeypatch):
    _, questions, session, player = await make_game(test_db, test_user)
    await test_db.quizzes.update_session_status(session['id'], 'in_progress')
    await test_db.quizzes.activate_question(session['id'], player['participant_token'])
    ready, go = asyncio.Event(), asyncio.Event()
    original = test_db.quizzes.record_answer

    async def delayed(*args):
        ready.set()
        await asyncio.wait_for(go.wait(), 5)
        return await original(*args)

    monkeypatch.setattr(test_db.quizzes, 'record_answer', delayed)
    async with AsyncClient(transport=ASGITransport(app=client.app), base_url='http://testserver') as http:
        answer = asyncio.create_task(http.post(f"/api/quiz-sessions/{session['id']}/answers",
            headers={'X-Quiz-Participant-Token': player['participant_token']},
            json={'participant_id': player['id'], 'question_id': questions[0]['id'], 'answer': '4'}))
        await asyncio.wait_for(ready.wait(), 5)
        await test_db.quizzes.update_session_status(session['id'], 'finished')
        go.set()
        assert (await answer).status_code == 409
    assert (await test_db.quizzes.get_participant(session['id'], player['id']))['score'] == 0


@pytest.mark.asyncio
async def test_clock_and_question_progress_survive_reload_and_client_lies(client, test_db, test_user, monkeypatch):
    _, questions, session, player = await make_game(test_db, test_user)
    await test_db.quizzes.update_session_status(session['id'], 'in_progress')
    monkeypatch.setattr('repositories.quiz_sessions.time.time', lambda: 1000)
    state = await test_db.quizzes.activate_question(session['id'], player['participant_token'])
    assert state['deadline_at'] == 1030
    assert 'correct_answer' not in state['current_question']
    monkeypatch.setattr('repositories.quiz_sessions.time.time', lambda: 1020)
    assert (await test_db.quizzes.activate_question(session['id'], player['participant_token']))['deadline_at'] == 1030
    with pytest.raises(QuizError):
        await test_db.quizzes.record_answer(session['id'], player['id'], questions[1]['id'], '4', player['participant_token'])
    monkeypatch.setattr('repositories.quiz_sessions.time.time', lambda: 1031)
    response = client.post(f"/api/quiz-sessions/{session['id']}/answers",
        headers={'X-Quiz-Participant-Token': player['participant_token']},
        json={'participant_id': player['id'], 'question_id': questions[0]['id'], 'answer': '4', 'time_taken_seconds': 0})
    assert response.json()['points_awarded'] == 0 and not response.json()['is_correct']
    reloaded = await test_db.quizzes.get_player_progress(session['id'], player['participant_token'])
    assert reloaded['result']['points_awarded'] == 0
    next_state = await test_db.quizzes.activate_question(session['id'], player['participant_token'], True, questions[0]['id'])
    assert next_state['deadline_at'] == 1061 and next_state['current_question']['id'] == questions[1]['id']
    monkeypatch.setattr('repositories.quiz_sessions.time.time', lambda: 1035)
    replay = await test_db.quizzes.activate_question(session['id'], player['participant_token'], True, questions[0]['id'])
    assert replay['deadline_at'] == 1061


@pytest.mark.asyncio
async def test_finished_session_cannot_restart(test_db, test_user):
    _, _, session, _ = await make_game(test_db, test_user)
    first = await test_db.quizzes.update_session_status(session['id'], 'in_progress')
    assert (await test_db.quizzes.update_session_status(session['id'], 'in_progress'))['started_at'] == first['started_at']
    await test_db.quizzes.update_session_status(session['id'], 'finished')
    with pytest.raises(QuizError):
        await test_db.quizzes.update_session_status(session['id'], 'in_progress')


@pytest.mark.asyncio
async def test_snapshot_survives_edit_and_deletion_of_source(test_db, test_user):
    _, questions, session, player = await make_game(test_db, test_user)
    await test_db.quizzes.update_session_status(session['id'], 'in_progress')
    await test_db.quizzes.activate_question(session['id'], player['participant_token'])
    await test_db.quizzes.update_question(questions[0]['id'], question_text='Edited', correct_answer='6')
    await test_db.quizzes.delete_question(questions[0]['id'])
    result = await test_db.quizzes.record_answer(session['id'], player['id'], questions[0]['id'], '4', player['participant_token'])
    assert result['is_correct']
    assert (await test_db.quizzes.get_session_stats(session['id']))['question_stats'][0]['question_text'] == 'Question 0'
    assert (await test_db.quizzes.get_player_progress(session['id'], player['participant_token']))['participant']['correct_count'] == 1


@pytest.mark.asyncio
async def test_finished_pin_collision_retries_and_exhaustion_is_clean(test_db, test_user, monkeypatch):
    quiz, _, session, _ = await make_game(test_db, test_user)
    await test_db.quizzes.update_session_status(session['id'], 'finished')
    previous = int(session['pin_code']) - 100000
    values = iter([previous, (previous + 1) % 900000])
    monkeypatch.setattr('repositories.quiz_sessions.secrets.randbelow', lambda _: next(values))
    next_session = await test_db.quizzes.create_session(quiz['id'], test_user['id'])
    assert next_session['pin_code'] != session['pin_code']
    monkeypatch.setattr('repositories.quiz_sessions.secrets.randbelow', lambda _: previous)
    with pytest.raises(QuizError):
        await test_db.quizzes.create_session(quiz['id'], test_user['id'])


@pytest.mark.asyncio
async def test_batch_creation_is_atomic(client, test_db, test_user):
    # Fail at the DB boundary after the quiz insert, rather than mocking validation.
    async with test_db.quizzes._connection() as db:
        await db.execute("CREATE TRIGGER reject_question BEFORE INSERT ON quiz_questions BEGIN SELECT RAISE(ABORT, 'reject'); END")
        await db.commit()
    with pytest.raises(sqlite3.IntegrityError):
        await test_db.quizzes.create_quiz('Must rollback', test_user['id'], questions=[{'question_text': 'Q', 'correct_answer': '4'}])
    assert not await test_db.quizzes.list_quizzes(created_by=test_user['id'])


@pytest.mark.asyncio
async def test_ws_requires_session_scoped_ticket(client, test_db, test_user, production):
    _, _, session, player = await make_game(test_db, test_user)
    _, _, other, _ = await make_game(test_db, test_user)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/quiz/{session['id']}?role=host"):
            pass
    path = f"/api/quiz-sessions/{session['id']}/ws-token"
    response = client.get(path, headers={'X-Quiz-Participant-Token': player['participant_token']})
    assert response.status_code == 200
    ticket = response.json()['token']
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/quiz/{other['id']}?token={ticket}"):
            pass
    with client.websocket_connect(f"/ws/quiz/{session['id']}?token={ticket}") as ws:
        assert ws.receive_json()['type'] == 'session_state'
        ws.send_json({'type': 'ping'})
        assert ws.receive_json() == {'type': 'pong'}
