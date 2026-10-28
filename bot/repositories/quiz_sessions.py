"""Quiz session snapshots, participant capabilities and atomic scoring."""
import json
import random
import secrets
import time
from typing import Optional, Dict, Any, List
import storage as db_driver

from utils.quiz import (QuizError, token_hash, public_participant, public_question,
                        answer_result, check_question_answer, calculate_speed_points)


class QuizSessionsMixin:
    @staticmethod
    async def _row(db, sql, args=()):
        db.row_factory = db_driver.Row
        async with db.execute(sql, args) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    async def _snapshot_questions(db, session_id):
        db.row_factory = db_driver.Row
        async with db.execute(
            "SELECT snapshot_json FROM quiz_session_questions WHERE session_id = ? ORDER BY position",
            (session_id,),
        ) as cursor:
            return [json.loads(row[0]) for row in await cursor.fetchall()]

    @staticmethod
    def _get_participant_question_order(participant: dict) -> Optional[List[int]]:
        raw = participant.get('question_order')
        if not raw or not isinstance(raw, str):
            return None
        try:
            val = json.loads(raw)
            return [int(x) for x in val] if isinstance(val, list) else None
        except Exception:
            return None

    async def create_session(self, quiz_id: int, host_id: int, settings=None):
        async with self._write_transaction() as db:
            quiz = await self._row(db, "SELECT * FROM quizzes WHERE id = ?", (quiz_id,))
            host = await self._row(db, "SELECT * FROM users WHERE id = ?", (host_id,))
            if not quiz or not host:
                raise QuizError("not_found", "Quiz or host not found")
            if not quiz['is_public'] and quiz['created_by'] != host_id and not host['is_admin']:
                raise QuizError("forbidden", "Private quiz is not available")
            async with db.execute("SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order, id", (quiz_id,)) as cursor:
                questions = [dict(row) for row in await cursor.fetchall()]
            if not questions:
                raise QuizError("invalid", "Quiz has no questions")
            for _ in range(100):
                pin = str(100000 + secrets.randbelow(900000))
                if not await self._row(db, "SELECT id FROM quiz_sessions WHERE pin_code = ?", (pin,)):
                    break
            else:
                raise QuizError("conflict", "No available PIN; try again")
            cursor = await db.execute(
                "INSERT INTO quiz_sessions (quiz_id, host_id, pin_code, status, settings) VALUES (?, ?, ?, 'lobby', ?)",
                (quiz_id, host_id, pin, json.dumps(settings or {}, ensure_ascii=False)),
            )
            session_id = cursor.lastrowid
            for position, question in enumerate(questions):
                for key in ('options', 'accepted_answers'):
                    question[key] = json.loads(question.get(key) or '[]')
                await db.execute("INSERT INTO quiz_session_questions VALUES (?, ?, ?, ?)",
                                 (session_id, question['id'], position, json.dumps(question, ensure_ascii=False)))
        return await self.get_session_by_id(session_id)

    async def get_session_by_id(self, session_id: int):
        async with self._connection() as db:
            session = await self._row(db, """SELECT s.*, q.title AS quiz_title,
                q.description AS quiz_description, u.nickname AS host_nickname
                FROM quiz_sessions s JOIN quizzes q ON q.id = s.quiz_id
                JOIN users u ON u.id = s.host_id WHERE s.id = ?""", (session_id,))
            if session:
                session['settings'] = json.loads(session.get('settings') or '{}')
            return session

    async def get_session_by_pin(self, pin_code: str):
        async with self._connection() as db:
            row = await self._row(db, "SELECT id FROM quiz_sessions WHERE pin_code = ? AND status != 'finished'", (pin_code,))
        return await self.get_session_by_id(row['id']) if row else None

    async def update_session_status(self, session_id: int, status: str, shuffle_questions: Optional[bool] = None):
        async with self._write_transaction() as db:
            row = await self._row(db, "SELECT * FROM quiz_sessions WHERE id = ?", (session_id,))
            if not row:
                raise QuizError('not_found', 'Session not found')
            if status == row['status']:
                pass  # Retry does not reset the clock.
            elif status == 'in_progress' and row['status'] == 'lobby':
                settings = json.loads(row.get('settings') or '{}') if isinstance(row.get('settings'), str) else (row.get('settings') or {})
                if shuffle_questions is not None:
                    settings['shuffle_questions'] = bool(shuffle_questions)
                await db.execute("UPDATE quiz_sessions SET status = ?, settings = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?", (status, json.dumps(settings, ensure_ascii=False), session_id))
                if settings.get('shuffle_questions'):
                    async with db.execute("SELECT question_id FROM quiz_session_questions WHERE session_id = ? ORDER BY position", (session_id,)) as cursor:
                        q_ids = [r[0] for r in await cursor.fetchall()]
                    if q_ids:
                        async with db.execute("SELECT id FROM quiz_participants WHERE session_id = ?", (session_id,)) as cursor:
                            p_rows = await cursor.fetchall()
                        for p_row in p_rows:
                            shuffled = list(q_ids)
                            random.shuffle(shuffled)
                            await db.execute("UPDATE quiz_participants SET question_order = ? WHERE id = ?", (json.dumps(shuffled), p_row[0]))
            elif status == 'finished' and row['status'] in ('lobby', 'in_progress'):
                await db.execute("UPDATE quiz_sessions SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?", (status, session_id))
            else:
                raise QuizError('conflict', 'Invalid session status transition')
        return await self.get_session_by_id(session_id)

    DEFAULT_AVATARS = (
        '#f3f4f6:barys', '#f3f4f6:fox', '#f3f4f6:wolf', '#f3f4f6:eagle',
        '#f3f4f6:panda', '#f3f4f6:owl', '#f3f4f6:tiger', '#f3f4f6:lion',
        '#f3f4f6:raccoon', '#f3f4f6:bear', '#f3f4f6:cat', '#f3f4f6:penguin',
        '#f3f4f6:rabbit', '#f3f4f6:koala', '#f3f4f6:pug', '#f3f4f6:dragon',
    )

    async def join_session(self, session_id: int, nickname: str, user_id=None, avatar_color=None, participant_token=None):
        nickname = nickname.strip()
        if not nickname:
            raise QuizError('invalid', 'Nickname is required')
        clean_avatar = (avatar_color or '').strip()[:64] or None
        async with self._write_transaction() as db:
            session = await self._row(db, 'SELECT * FROM quiz_sessions WHERE id = ?', (session_id,))
            if not session or session['status'] == 'finished':
                raise QuizError('conflict', 'Session is not accepting participants')
            existing = await self._row(db, 'SELECT * FROM quiz_participants WHERE session_id = ? AND nickname = ?', (session_id, nickname))
            if existing:
                owns_token = bool(participant_token and existing['token_hash'] == token_hash(participant_token))
                owns_account = bool(user_id and existing['user_id'] == user_id)
                if not owns_token and not owns_account:
                    raise QuizError('conflict', 'Nickname already taken; choose another nickname')
                participant_id = existing['id']
                if owns_token:
                    issued_token = participant_token
                else:
                    # Authenticated account recovery also handles legacy records.
                    issued_token = secrets.token_urlsafe(32)
                    await db.execute('UPDATE quiz_participants SET token_hash = ? WHERE id = ?', (token_hash(issued_token), participant_id))
                if clean_avatar:
                    await db.execute('UPDATE quiz_participants SET avatar_color = ? WHERE id = ?', (clean_avatar, participant_id))
            else:
                issued_token = secrets.token_urlsafe(32)
                color = clean_avatar or random.choice(self.DEFAULT_AVATARS)
                cursor = await db.execute('''INSERT INTO quiz_participants
                    (session_id, user_id, nickname, avatar_color, token_hash) VALUES (?, ?, ?, ?, ?)''',
                    (session_id, user_id, nickname, color, token_hash(issued_token)))
                participant_id = cursor.lastrowid
                if session.get('status') == 'in_progress':
                    s_settings = json.loads(session.get('settings') or '{}') if isinstance(session.get('settings'), str) else (session.get('settings') or {})
                    if s_settings.get('shuffle_questions'):
                        async with db.execute('SELECT question_id FROM quiz_session_questions WHERE session_id = ? ORDER BY position', (session_id,)) as cursor:
                            q_ids = [r[0] for r in await cursor.fetchall()]
                        if q_ids:
                            random.shuffle(q_ids)
                            await db.execute('UPDATE quiz_participants SET question_order = ? WHERE id = ?', (json.dumps(q_ids), participant_id))
            participant = await self._row(db, 'SELECT * FROM quiz_participants WHERE id = ?', (participant_id,))
        return {**public_participant(participant), 'participant_token': issued_token}

    async def update_participant_avatar(self, session_id: int, avatar_color: str, participant_token: str):
        clean_avatar = (avatar_color or '').strip()
        if not clean_avatar or len(clean_avatar) > 64:
            raise QuizError('invalid', 'Avatar is required')
        async with self._write_transaction() as db:
            participant = await self._token_participant(db, session_id, participant_token)
            session = await self._row(db, 'SELECT status FROM quiz_sessions WHERE id = ?', (session_id,))
            if not session or session['status'] == 'finished':
                raise QuizError('conflict', 'Session is not accepting updates')
            await db.execute(
                'UPDATE quiz_participants SET avatar_color = ?, last_active_at = CURRENT_TIMESTAMP WHERE session_id = ? AND id = ?',
                (clean_avatar, session_id, participant['id']),
            )
            updated = await self._row(db, 'SELECT * FROM quiz_participants WHERE id = ?', (participant['id'],))
        return public_participant(updated)

    async def get_participant(self, session_id: int, participant_id: int):
        async with self._connection() as db:
            return await self._row(db, 'SELECT * FROM quiz_participants WHERE session_id = ? AND id = ?', (session_id, participant_id))

    async def _token_participant(self, db, session_id, participant_token, participant_id=None):
        participant = await self._row(db, 'SELECT * FROM quiz_participants WHERE session_id = ? AND token_hash = ?',
                                      (session_id, token_hash(participant_token)))
        if not participant or (participant_id is not None and participant['id'] != participant_id):
            raise QuizError('unauthorized', 'Invalid participant token')
        return participant

    async def authenticate_participant(self, session_id, participant_token):
        async with self._connection() as db:
            return await self._token_participant(db, session_id, participant_token)

    async def claim_participant(self, session_id, participant_token, user_id):
        """Attach a capability-owned guest result once; never transfer another account's result."""
        async with self._write_transaction() as db:
            participant = await self._token_participant(db, session_id, participant_token)
            if participant['user_id'] is not None and participant['user_id'] != user_id:
                raise QuizError('forbidden', 'This result belongs to another account')
            await db.execute('UPDATE quiz_participants SET user_id = ? WHERE id = ? AND user_id IS NULL',
                             (user_id, participant['id']))
            owner = await self._row(db, 'SELECT user_id FROM quiz_participants WHERE id = ?', (participant['id'],))
            if owner['user_id'] != user_id:
                raise QuizError('forbidden', 'This result belongs to another account')
            return {'participant_id': participant['id'], 'session_id': session_id, 'linked': True}

    async def _review_access(self, db, session_id, participant_token='', user_id=None, participant_id=None):
        if participant_token:
            participant = await self._token_participant(db, session_id, participant_token, participant_id)
            if participant['user_id'] is not None and participant['user_id'] != user_id:
                raise QuizError('forbidden', 'Sign in to the account that owns this result')
        elif user_id and participant_id:
            participant = await self._row(db, 'SELECT * FROM quiz_participants WHERE id = ? AND session_id = ? AND user_id = ?',
                                          (participant_id, session_id, user_id))
            if not participant:
                raise QuizError('forbidden', 'Result is not available to this account')
        else:
            raise QuizError('unauthorized', 'Participant token or account required')
        session = await self._row(db, 'SELECT status FROM quiz_sessions WHERE id = ?', (session_id,))
        if not participant['is_finished'] and session['status'] != 'finished':
            raise QuizError('conflict', 'Finish the quiz before reviewing answers')
        return participant

    async def get_player_review(self, session_id, participant_token='', user_id=None, participant_id=None):
        async with self._connection() as db:
            participant = await self._review_access(db, session_id, participant_token, user_id, participant_id)
            questions = await self._snapshot_questions(db, session_id)
            order = self._get_participant_question_order(participant)
            if order:
                positions = {question_id: index for index, question_id in enumerate(order)}
                questions.sort(key=lambda q: positions.get(q['id'], len(order)))
            async with db.execute('SELECT * FROM quiz_answers WHERE session_id = ? AND participant_id = ?',
                                  (session_id, participant['id'])) as cursor:
                answers = {row['question_id']: dict(row) for row in await cursor.fetchall()}
            items = [{
                'question': {**public_question(q), 'correct_answer': q.get('correct_answer', ''), 'explanation': q.get('explanation')},
                'user_answer': answers.get(q['id'], {}).get('user_answer', ''),
                'is_correct': bool(answers.get(q['id'], {}).get('is_correct', False)),
            } for q in questions]
            session = await self._row(db, 'SELECT q.title FROM quiz_sessions s JOIN quizzes q ON q.id = s.quiz_id WHERE s.id = ?', (session_id,))
            return {'session_id': session_id, 'quiz_title': session['title'],
                    'participant': public_participant(participant), 'items': items}

    async def check_review_answer(self, session_id, question_id, answer, participant_token='', user_id=None, participant_id=None):
        async with self._connection() as db:
            await self._review_access(db, session_id, participant_token, user_id, participant_id)
            row = await self._row(db, 'SELECT snapshot_json FROM quiz_session_questions WHERE session_id = ? AND question_id = ?',
                                  (session_id, question_id))
            if not row:
                raise QuizError('not_found', 'Question not found in this game')
            question = json.loads(row['snapshot_json'])
            # Practice is deliberately read-only: original answers, ranks and scores stay immutable.
            return {'is_correct': check_question_answer(question, answer),
                    'correct_answer': question.get('correct_answer', ''), 'explanation': question.get('explanation')}

    async def list_participants(self, session_id: int):
        async with self._connection() as db:
            return await self._public_participants(db, session_id)

    @staticmethod
    async def _public_participants(db, session_id):
        db.row_factory = db_driver.Row
        async with db.execute('SELECT * FROM quiz_participants WHERE session_id = ? ORDER BY score DESC, correct_count DESC, id', (session_id,)) as cursor:
            return [public_participant(dict(row)) for row in await cursor.fetchall()]

    async def get_session_questions(self, session_id):
        async with self._connection() as db:
            return await self._snapshot_questions(db, session_id)

    async def get_participant_answer(self, session_id, participant_id, question_id):
        async with self._connection() as db:
            return await self._row(db, 'SELECT * FROM quiz_answers WHERE session_id = ? AND participant_id = ? AND question_id = ?',
                                   (session_id, participant_id, question_id))

    async def _progress(self, db, session_id, participant, now):
        session = await self._row(db, '''SELECT s.id, s.status, s.pin_code,
            q.title AS quiz_title, u.nickname AS host_nickname,
            (SELECT COUNT(*) FROM quiz_session_questions WHERE session_id = s.id) AS question_count
            FROM quiz_sessions s JOIN quizzes q ON q.id = s.quiz_id
            JOIN users u ON u.id = s.host_id WHERE s.id = ?''', (session_id,))
        index = participant['current_question_index']
        order = self._get_participant_question_order(participant)
        if order and 0 <= index < len(order):
            row = await self._row(db, 'SELECT snapshot_json FROM quiz_session_questions WHERE session_id = ? AND question_id = ?',
                                  (session_id, order[index]))
        else:
            row = await self._row(db, 'SELECT snapshot_json FROM quiz_session_questions WHERE session_id = ? AND position = ?',
                                  (session_id, index))
        question = json.loads(row['snapshot_json']) if row else None
        answer = None
        if question:
            answer = await self._row(db, 'SELECT * FROM quiz_answers WHERE session_id = ? AND participant_id = ? AND question_id = ?',
                                     (session_id, participant['id'], question['id']))
        started_at = participant['question_started_at']
        visible = question if started_at is not None or answer else None
        question_count = session.pop('question_count')
        if session['status'] == 'lobby':
            session['participants'] = await self._public_participants(db, session_id)
        rank = None
        if participant['is_finished'] or session['status'] == 'finished':
            # Match the host's leaderboard ordering without returning the entire class.
            ranked = await self._row(db, '''SELECT COUNT(*) + 1 AS rank FROM quiz_participants
                WHERE session_id = ? AND (score > ? OR (score = ? AND correct_count > ?)
                    OR (score = ? AND correct_count = ? AND id < ?))''',
                (session_id, participant['score'], participant['score'], participant['correct_count'],
                 participant['score'], participant['correct_count'], participant['id']))
            rank = ranked['rank']
        return {
            'status': session['status'], 'participant': public_participant(participant),
            'session': session, 'rank': rank,
            'question_count': question_count, 'current_question_index': index,
            'current_question': public_question(visible) if visible else None,
            'deadline_at': started_at + question['time_limit_seconds'] if started_at is not None and question else None,
            'server_now': now, 'result': answer_result(answer, participant, question) if answer else None,
        }

    async def get_player_progress(self, session_id, participant_token):
        async with self._connection() as db:
            participant = await self._token_participant(db, session_id, participant_token)
            return await self._progress(db, session_id, participant, time.time())

    async def activate_question(self, session_id, participant_token, advance=False, question_id=None):
        async with self._write_transaction() as db:
            participant = await self._token_participant(db, session_id, participant_token)
            session = await self._row(db, 'SELECT status, settings FROM quiz_sessions WHERE id = ?', (session_id,))
            if session['status'] != 'in_progress':
                raise QuizError('conflict', 'Game is not active')
            questions = await self._snapshot_questions(db, session_id)
            now = time.time()
            if participant['is_finished']:
                return await self._progress(db, session_id, participant, now)
            index = participant['current_question_index']
            if not questions:
                raise QuizError('conflict', 'Session has no playable questions')

            settings = json.loads(session.get('settings') or '{}') if isinstance(session.get('settings'), str) else (session.get('settings') or {})
            order = self._get_participant_question_order(participant)
            if order is None and settings.get('shuffle_questions'):
                q_ids = [q['id'] for q in questions]
                random.shuffle(q_ids)
                order = q_ids
                order_json = json.dumps(order)
                await db.execute('UPDATE quiz_participants SET question_order = ? WHERE id = ?', (order_json, participant['id']))
                participant['question_order'] = order_json

            total_count = len(order) if order else len(questions)
            if index >= total_count:
                raise QuizError('conflict', 'Session has no playable questions')

            current_expected_id = order[index] if order and 0 <= index < len(order) else questions[index]['id']

            if advance:
                if question_id != current_expected_id:
                    # A delayed retry for an earlier answered question must not advance twice.
                    previous = await self._row(db, 'SELECT id FROM quiz_answers WHERE session_id = ? AND participant_id = ? AND question_id = ?',
                                               (session_id, participant['id'], question_id))
                    if previous:
                        return await self._progress(db, session_id, participant, now)
                    raise QuizError('conflict', 'Question does not match current progress')
                answered = await self._row(db, 'SELECT id FROM quiz_answers WHERE session_id = ? AND participant_id = ? AND question_id = ?',
                                          (session_id, participant['id'], current_expected_id))
                if not answered:
                    raise QuizError('conflict', 'Answer the current question first')
                if index + 1 == total_count:
                    await db.execute('UPDATE quiz_participants SET is_finished = 1 WHERE session_id = ? AND id = ?', (session_id, participant['id']))
                else:
                    await db.execute('UPDATE quiz_participants SET current_question_index = ?, question_started_at = ? WHERE session_id = ? AND id = ?',
                                     (index + 1, now, session_id, participant['id']))
            elif participant['question_started_at'] is None:
                await db.execute('UPDATE quiz_participants SET question_started_at = ? WHERE session_id = ? AND id = ?', (now, session_id, participant['id']))
            participant = await self._row(db, 'SELECT * FROM quiz_participants WHERE id = ?', (participant['id'],))
            return await self._progress(db, session_id, participant, now)

    async def record_answer(self, session_id, participant_id, question_id, user_answer, participant_token):
        """Authorize, check clock/state, grade and persist exactly once in one write transaction."""
        async with self._write_transaction() as db:
            participant = await self._token_participant(db, session_id, participant_token, participant_id)
            question_row = await self._row(db, 'SELECT snapshot_json, position FROM quiz_session_questions WHERE session_id = ? AND question_id = ?',
                                          (session_id, question_id))
            if not question_row:
                raise QuizError('not_found', 'Question not found in this session')
            question = json.loads(question_row['snapshot_json'])
            existing = await self._row(db, 'SELECT * FROM quiz_answers WHERE session_id = ? AND participant_id = ? AND question_id = ?',
                                      (session_id, participant_id, question_id))
            if existing:
                return {**answer_result(existing, participant, question), 'reused': True,
                        'progress': await self._progress(db, session_id, participant, time.time())}
            session = await self._row(db, 'SELECT status, settings FROM quiz_sessions WHERE id = ?', (session_id,))
            if session['status'] != 'in_progress':
                raise QuizError('conflict', 'Game session is not active')
            if participant['is_finished']:
                raise QuizError('conflict', 'Participant is finished')

            settings = json.loads(session.get('settings') or '{}') if isinstance(session.get('settings'), str) else (session.get('settings') or {})
            order = self._get_participant_question_order(participant)
            if order is None and settings.get('shuffle_questions'):
                async with db.execute('SELECT question_id FROM quiz_session_questions WHERE session_id = ? ORDER BY position', (session_id,)) as cursor:
                    q_ids = [r[0] for r in await cursor.fetchall()]
                if q_ids:
                    random.shuffle(q_ids)
                    order = q_ids
                    order_json = json.dumps(order)
                    await db.execute('UPDATE quiz_participants SET question_order = ? WHERE id = ?', (order_json, participant['id']))
                    participant['question_order'] = order_json

            if order:
                curr_idx = participant['current_question_index']
                expected_qid = order[curr_idx] if 0 <= curr_idx < len(order) else None
                if question_id != expected_qid or participant['question_started_at'] is None:
                    raise QuizError('conflict', 'Question has not been activated')
            else:
                if participant['current_question_index'] != question_row['position'] or participant['question_started_at'] is None:
                    raise QuizError('conflict', 'Question has not been activated')

            elapsed = max(0.0, time.time() - participant['question_started_at'])
            is_correct = elapsed < question['time_limit_seconds'] and check_question_answer(question, user_answer)
            points = calculate_speed_points(question['points'], question['time_limit_seconds'], elapsed, participant['streak'] + 1) if is_correct else 0
            await db.execute('''INSERT INTO quiz_answers
                (session_id, participant_id, question_id, user_answer, is_correct, time_taken_seconds, points_awarded)
                VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (session_id, participant_id, question_id, user_answer, int(is_correct), elapsed, points))
            await db.execute('''UPDATE quiz_participants SET score = score + ?, streak = ?,
                correct_count = correct_count + ?, total_answered = total_answered + 1,
                last_active_at = CURRENT_TIMESTAMP WHERE session_id = ? AND id = ?''',
                (points, participant['streak'] + 1 if is_correct else 0, int(is_correct), session_id, participant_id))
            participant = await self._row(db, 'SELECT * FROM quiz_participants WHERE id = ?', (participant_id,))
            return {**answer_result({'is_correct': is_correct, 'points_awarded': points}, participant, question),
                    'reused': False, 'progress': await self._progress(db, session_id, participant, time.time())}

    async def set_participant_finished(self, session_id, participant_id, participant_token):
        async with self._write_transaction() as db:
            participant = await self._token_participant(db, session_id, participant_token, participant_id)
            question_count = await self._row(db, 'SELECT COUNT(*) AS n FROM quiz_session_questions WHERE session_id = ?', (session_id,))
            answer_count = await self._row(db, 'SELECT COUNT(*) AS n FROM quiz_answers WHERE session_id = ? AND participant_id = ?', (session_id, participant_id))
            if answer_count['n'] != question_count['n']:
                raise QuizError('conflict', 'Not all questions have been answered')
            await db.execute('UPDATE quiz_participants SET is_finished = 1 WHERE session_id = ? AND id = ?', (session_id, participant['id']))

    async def get_session_leaderboard(self, session_id):
        return await self.list_participants(session_id)

    async def get_session_stats(self, session_id):
        leaderboard = await self.get_session_leaderboard(session_id)
        async with self._connection() as db:
            questions = await self._snapshot_questions(db, session_id)
            stats = []
            for question in questions:
                row = await self._row(db, '''SELECT COUNT(*) AS total_answers,
                    COALESCE(SUM(is_correct), 0) AS correct_answers, AVG(time_taken_seconds) AS avg_time
                    FROM quiz_answers WHERE session_id = ? AND question_id = ?''', (session_id, question['id']))
                stats.append({'question_id': question['id'], 'question_text': question['question_text'],
                              'sort_order': question['sort_order'], **row})
        return {'session_id': session_id, 'total_players': len(leaderboard),
                'leaderboard': leaderboard, 'podium': leaderboard[:3], 'question_stats': stats}

    async def get_quiz_sessions(self, quiz_id: int, host_id: int | None = None):
        where_sql = "s.quiz_id = ?"
        params: list = [quiz_id]
        if host_id is not None:
            where_sql += " AND s.host_id = ?"
            params.append(host_id)

        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute(f"""
                SELECT s.*,
                    u.nickname AS host_nickname,
                    COUNT(p.id) AS participant_count,
                    COALESCE(SUM(CASE WHEN p.is_finished = 1 THEN 1 ELSE 0 END), 0) AS finished_count,
                    COALESCE(AVG(p.score), 0) AS avg_score,
                    COALESCE(MAX(p.score), 0) AS max_score
                FROM quiz_sessions s
                LEFT JOIN users u ON u.id = s.host_id
                LEFT JOIN quiz_participants p ON p.session_id = s.id
                WHERE {where_sql}
                GROUP BY s.id, u.nickname
                ORDER BY s.created_at DESC
            """, tuple(params)) as cursor:
                sessions = [dict(row) for row in await cursor.fetchall()]

            for s in sessions:
                s['settings'] = json.loads(s.get('settings') or '{}')
                s['avg_score'] = round(float(s['avg_score']))
                async with db.execute("""
                    SELECT id, nickname, avatar_color, score, correct_count, total_answered, is_finished
                    FROM quiz_participants
                    WHERE session_id = ?
                    ORDER BY score DESC, correct_count DESC, id ASC
                    LIMIT 3
                """, (s['id'],)) as p_cursor:
                    s['top_participants'] = [dict(r) for r in await p_cursor.fetchall()]

            return sessions

    async def get_session_full_results(self, session_id: int):
        session = await self.get_session_by_id(session_id)
        if not session:
            return None
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute("""
                SELECT id, session_id, user_id, nickname, avatar_color, score, streak,
                       correct_count, total_answered, is_finished, joined_at, last_active_at
                FROM quiz_participants
                WHERE session_id = ?
                ORDER BY score DESC, correct_count DESC, id ASC
            """, (session_id,)) as cursor:
                participants = [dict(row) for row in await cursor.fetchall()]

            for idx, p in enumerate(participants):
                p['rank'] = idx + 1
                total = p['total_answered'] or 1
                p['accuracy_percent'] = round((p['correct_count'] / total) * 100) if p['total_answered'] > 0 else 0

            questions = await self._snapshot_questions(db, session_id)
            stats = []
            for question in questions:
                row = await self._row(db, '''SELECT COUNT(*) AS total_answers,
                    COALESCE(SUM(is_correct), 0) AS correct_answers, AVG(time_taken_seconds) AS avg_time
                    FROM quiz_answers WHERE session_id = ? AND question_id = ?''', (session_id, question['id']))
                stats.append({'question_id': question['id'], 'question_text': question['question_text'],
                              'question_type': question.get('question_type', 'mcq'),
                              'sort_order': question['sort_order'], **row})

            async with db.execute("""
                SELECT participant_id, question_id, user_answer, is_correct, time_taken_seconds, points_awarded
                FROM quiz_answers
                WHERE session_id = ?
            """, (session_id,)) as cursor:
                answers = [dict(row) for row in await cursor.fetchall()]

            answers_by_participant = {}
            for ans in answers:
                pid = ans['participant_id']
                answers_by_participant.setdefault(pid, []).append(ans)

            for p in participants:
                p['answers'] = answers_by_participant.get(p['id'], [])

        return {
            'session': session,
            'participants': participants,
            'question_stats': stats,
            'total_players': len(participants),
        }

    async def get_user_quiz_history(self, user_id: int):
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute("""
                SELECT p.id AS participant_id, p.session_id, p.nickname, p.avatar_color,
                       p.score, p.correct_count, p.total_answered, p.is_finished, p.joined_at,
                       s.quiz_id, s.status AS session_status, s.pin_code, s.created_at AS session_date,
                       q.title AS quiz_title,
                       (SELECT COUNT(*) FROM quiz_session_questions WHERE session_id = s.id) AS question_count,
                       (SELECT COUNT(*) + 1 FROM quiz_participants
                        WHERE session_id = s.id AND (score > p.score OR (score = p.score AND correct_count > p.correct_count))) AS rank,
                       (SELECT COUNT(*) FROM quiz_participants WHERE session_id = s.id) AS total_participants
                FROM quiz_participants p
                JOIN quiz_sessions s ON s.id = p.session_id
                JOIN quizzes q ON q.id = s.quiz_id
                WHERE p.user_id = ?
                ORDER BY p.joined_at DESC
            """, (user_id,)) as cursor:
                history = [dict(row) for row in await cursor.fetchall()]

            for item in history:
                total = item['question_count'] or item['total_answered'] or 1
                item['accuracy_percent'] = round((item['correct_count'] / total) * 100) if total > 0 else 0

            return history
