"""Local regressions for compact quiz state and fewer polling reads."""
from unittest.mock import AsyncMock

import pytest

from routes.quiz_game import quiz_manager


@pytest.fixture
async def game(test_db, test_user):
    quiz = await test_db.quizzes.create_quiz('Compact quiz', test_user['id'])
    questions = [await test_db.quizzes.add_question(
        quiz['id'], f'Question {index}', question_type='input', correct_answer='4', sort_order=index,
    ) for index in range(2)]
    session = await test_db.quizzes.create_session(quiz['id'], test_user['id'])
    player = await test_db.quizzes.join_session(session['id'], 'Guest')
    return questions, session, player


@pytest.mark.asyncio
async def test_compact_progress_keeps_lobby_roster_but_omits_it_during_play(client, test_db, game, monkeypatch):
    questions, session, player = game
    other = await test_db.quizzes.join_session(session['id'], 'Classmate')
    snapshots = AsyncMock(wraps=test_db.quizzes._snapshot_questions)
    monkeypatch.setattr(test_db.quizzes, '_snapshot_questions', snapshots)
    url = f"/api/quiz-sessions/{session['id']}/progress"
    headers = {'X-Quiz-Participant-Token': player['participant_token']}

    response = client.get(url, headers=headers)
    assert response.status_code == 200
    state = response.json()
    assert state['session']['pin_code'] == session['pin_code']
    assert state['session']['quiz_title'] == 'Compact quiz'
    assert {p['id'] for p in state['session']['participants']} == {player['id'], other['id']}
    assert state['current_question'] is None and state['question_count'] == 2
    assert state['rank'] is None
    assert 'token_hash' not in response.text and player['participant_token'] not in response.text
    assert other['participant_token'] not in response.text and 'correct_answer' not in response.text
    assert 'no-store' in response.headers['cache-control']
    snapshots.assert_not_awaited()

    await test_db.quizzes.update_session_status(session['id'], 'in_progress')
    await test_db.quizzes.activate_question(session['id'], player['participant_token'])
    snapshots.reset_mock()
    state = client.get(url, headers=headers).json()
    assert state['status'] == state['session']['status'] == 'in_progress'
    assert 'participants' not in state['session']
    assert state['current_question']['id'] == questions[0]['id']
    assert 'correct_answer' not in state['current_question']
    assert state['result'] is None and state['rank'] is None
    snapshots.assert_not_awaited()


@pytest.mark.asyncio
async def test_answer_contains_saved_progress_and_retries_do_not_regrade_or_read_unused_leaderboards(
    client, test_db, game, monkeypatch,
):
    questions, session, player = game
    monkeypatch.setattr('repositories.quiz_sessions.time.time', lambda: 1000)
    monkeypatch.setattr(quiz_manager, 'sessions', {})
    leaderboard = AsyncMock(side_effect=AssertionError('No WebSocket audience'))
    monkeypatch.setattr(test_db.quizzes, 'get_session_leaderboard', leaderboard)
    await test_db.quizzes.update_session_status(session['id'], 'in_progress')
    await test_db.quizzes.activate_question(session['id'], player['participant_token'])
    url = f"/api/quiz-sessions/{session['id']}"
    headers = {'X-Quiz-Participant-Token': player['participant_token']}
    payload = {'participant_id': player['id'], 'question_id': questions[0]['id'], 'answer': '4'}

    response = client.post(url + '/answers', json=payload, headers=headers)
    assert response.status_code == 200
    saved = response.json()
    assert saved['is_correct'] is True and saved['points_awarded'] > 0
    assert saved['progress']['participant']['score'] == saved['total_score']
    assert saved['progress']['participant']['total_answered'] == 1
    assert saved['progress']['result'] == {k: v for k, v in saved.items() if k != 'progress'}
    assert 'reused' not in saved and 'token_hash' not in response.text
    assert 'correct_answer' not in saved['progress']['current_question']

    next_state = client.post(url + '/next', json={'question_id': questions[0]['id']}, headers=headers).json()
    assert next_state['current_question']['id'] == questions[1]['id']
    retry = client.post(url + '/answers', json={**payload, 'answer': 'wrong'}, headers=headers).json()
    assert retry['points_awarded'] == saved['points_awarded']
    assert retry['progress']['participant']['total_answered'] == 1
    assert retry['progress']['current_question']['id'] == questions[1]['id']
    assert retry['progress']['result'] is None

    await test_db.quizzes.update_session_status(session['id'], 'finished')
    retry = client.post(url + '/answers', json=payload, headers=headers).json()
    assert retry['progress']['status'] == 'finished'
    assert retry['progress']['rank'] == 1
    assert retry['total_score'] == saved['total_score']
    leaderboard.assert_not_awaited()


@pytest.mark.asyncio
async def test_compact_rank_matches_leaderboard_ties_and_updates_until_game_finishes(test_db, game):
    _, session, player = game
    players = [player] + [await test_db.quizzes.join_session(session['id'], name)
                          for name in ('Second', 'Third', 'Fourth')]
    await test_db.quizzes.update_session_status(session['id'], 'in_progress')
    async with test_db.quizzes._write_transaction() as db:
        for participant, score, correct in zip(players, (100, 100, 100, 50), (1, 2, 2, 1)):
            await db.execute('UPDATE quiz_participants SET score = ?, correct_count = ?, is_finished = 1 WHERE id = ?',
                             (score, correct, participant['id']))
    for participant in players:
        state = await test_db.quizzes.get_player_progress(session['id'], participant['participant_token'])
        expected = [p['id'] for p in await test_db.quizzes.get_session_leaderboard(session['id'])]
        assert state['rank'] == expected.index(participant['id']) + 1
        assert 'participants' not in state['session']
    assert (await test_db.quizzes.get_player_progress(session['id'], player['participant_token']))['rank'] == 3
    async with test_db.quizzes._write_transaction() as db:
        await db.execute('UPDATE quiz_participants SET score = 200 WHERE id = ?', (players[-1]['id'],))
    assert (await test_db.quizzes.get_player_progress(session['id'], player['participant_token']))['rank'] == 4
    await test_db.quizzes.update_session_status(session['id'], 'finished')
    state = await test_db.quizzes.get_player_progress(session['id'], player['participant_token'])
    assert state['rank'] == 4 and state['session']['status'] == 'finished'
