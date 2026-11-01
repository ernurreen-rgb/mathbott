"""Read-only source audit reproductions. Run: python audit_domain_repros.py E:\CursorMathbot\bot
Creates only isolated files under a newly allocated temporary directory.
"""
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else r'E:\CursorMathbot\bot')
from database import Database
from fastapi import FastAPI
from slowapi import Limiter
from repositories.curriculum_repository import CurriculumRepository
from routes.trial_tests_coop import setup_trial_tests_coop_routes
from utils.connection_pool import ConnectionPool
from utils.public_payload import task_review_snapshot
import utils.file_storage as file_storage

ROOT = Path(tempfile.mkdtemp(prefix='mathbot-domain-audit-'))

async def fresh(name):
    db = Database(str(ROOT / (name + '.db')), use_pool=False)
    await db.init()
    return db

async def coop_answer_key():
    db = await fresh('coop')
    a = await db.users.create_user_by_email('audit-a@example.com')
    b = await db.users.create_user_by_email('audit-b@example.com')
    trial = await db.trial_tests.create_trial_test('Audit')
    task = await db.trial_tests.create_trial_test_task(trial['id'], '2+2', '4')
    session = await db.trial_test_coop.create_session(trial['id'], a['id'])
    for user, color in [(a, 'red'), (b, 'blue')]:
        await db.trial_test_coop.add_participant(session['id'], user['id'], color)
    app = FastAPI()
    setup_trial_tests_coop_routes(app, db, Limiter(key_func=lambda: 'audit'))
    finish = next(r.endpoint for r in app.routes if getattr(r, 'name', '') == 'finish_coop_session')
    results = next(r.endpoint for r in app.routes if getattr(r, 'name', '') == 'get_coop_results')
    await finish(trial['id'], {'email': a['email'], 'session_id': session['id'], 'answers': {}}, db)
    pending = await db.trial_test_coop.get_participant(session['id'], b['id'])
    response = await results(session['id'], b['email'], db)
    evidence = {'b_is_finished': pending['is_finished'], 'session_status': response['status'],
                'peer_correct_answer': response['items'][0]['answers'][str(task['id'])]['correct_answer']}
    assert evidence == {'b_is_finished': 0, 'session_status': 'active', 'peer_correct_answer': '4'}
    return evidence

async def nested_pool():
    db = await fresh('pool')
    module = await db.curriculum.create_module('Audit')
    section = await db.curriculum.create_section(module['id'], 'Audit')
    # Match PostgreSQL's configured capacity, using SQLite as the isolated backend.
    pool = ConnectionPool(db.db_path, min_size=0, max_size=2, timeout=.25)
    repo = CurriculumRepository(db.db_path, connection_pool=pool)
    original_ensure = repo.ensure_default_mini_lessons
    entered = 0
    both_entered = asyncio.Event()
    async def synchronized(lesson_id):
        # Force an ordinary valid interleaving: both callers hold their outer connections.
        nonlocal entered
        entered += 1
        if entered == 2:
            both_entered.set()
        await both_entered.wait()
        await original_ensure(lesson_id)
    repo.ensure_default_mini_lessons = synchronized
    try:
        results = await asyncio.gather(repo.create_lesson(section['id'], 1),
                                       repo.create_lesson(section['id'], 2), return_exceptions=True)
        lessons = await db.curriculum.get_lessons_by_section(section['id'])
        counts = [len(await db.curriculum.get_mini_lessons_by_lesson(lesson['id'])) for lesson in lessons]
        evidence = {'result_types': [type(r).__name__ for r in results],
                    'persisted_lessons': len(lessons), 'mini_lesson_counts': counts}
        assert all(isinstance(r, TimeoutError) for r in results)
        assert counts == [0, 0]
        return evidence
    finally:
        await pool.close()

async def concurrent_user_creation():
    db = await fresh('users')
    # Natural concurrency; repeat with a new email if the scheduler happens to serialize one batch.
    for attempt in range(10):
        email = f'same-first-login-{attempt}@example.com'
        results = await asyncio.gather(*[db.users.create_user_by_email(email) for _ in range(8)], return_exceptions=True)
        errors = [str(result) for result in results if isinstance(result, Exception)]
        if errors:
            assert any('UNIQUE constraint failed' in error for error in errors)
            return {'result_types': [type(result).__name__ for result in results], 'errors': errors}
    return {'reproduced': False, 'note': 'Scheduler serialized these batches; inspect SELECT-then-INSERT race.'}

async def cleanup_image_history():
    db = await fresh('images')
    images_dir = ROOT / 'images'
    images_dir.mkdir()
    file_storage._IMAGES_DIR = images_dir
    os.environ['IMAGE_STORAGE_BACKEND'] = 'local'
    filename = 'audit-saved-result.png'
    image_path = images_dir / filename
    image_path.write_bytes(b'\x89PNG\r\n\x1a\nAUDIT')
    user = await db.users.create_user_by_email('image-history@example.com')
    bank = await db.bank_tasks.create_task(text='Image-only exercise', answer='4', question_type='input', difficulty='B',
                                           image_filename=filename, created_by=user['id'])
    trial = await db.trial_tests.create_trial_test('Image history')
    task = await db.trial_tests.create_trial_test_task(trial['id'], '', '', bank_task_id=bank['id'])
    await db.trial_tests.submit_trial_test_attempt(
        user_id=user['id'], trial_test_id=trial['id'], score=0, total=1, percentage=0,
        answers={task['id']: {'answer': '', 'correct': False, 'correct_answer': '4',
                              'task': task_review_snapshot(task)}},
        completions=[], should_update_streak=False, attempt_id='image-audit')
    before = image_path.exists()
    async with db.bank_tasks._connection() as connection:
        await connection.execute("UPDATE bank_tasks SET deleted_at = '2000-01-01 00:00:00' WHERE id = ?", (bank['id'],))
        await connection.commit()
    purged = await db.bank_tasks.cleanup_old_deleted_tasks(days=30)
    results = await db.trial_tests.get_user_trial_test_results(user['id'], trial['id'])
    historic_filename = json.loads(results[0]['answers'])[str(task['id'])]['task']['image_filename']
    evidence = {'image_existed_before': before, 'purged_tasks': purged,
                'saved_results_remaining': len(results), 'historic_filename': historic_filename,
                'image_exists_after': image_path.exists()}
    assert before and purged == 1 and len(results) == 1 and historic_filename == filename and not image_path.exists()
    return evidence

async def rollback_text_scale():
    db = await fresh('rollback')
    task = await db.bank_tasks.create_task(text='Scale', answer='4', question_type='input', difficulty='B', text_scale='sm')
    updated = await db.bank_tasks.update_task(task['id'], text_scale='lg')
    rolled_back = await db.bank_tasks.rollback_task(task['id'], target_version=1,
                                                   expected_current_version=updated['current_version'])
    evidence = {'target_scale': 'sm', 'before_rollback_scale': updated['text_scale'],
                'after_rollback_scale': rolled_back['text_scale']}
    assert rolled_back['text_scale'] == 'lg'
    return evidence

async def main():
    print(json.dumps({'artifact_directory': str(ROOT)}))
    checks = [('coop_answer_key', coop_answer_key), ('nested_pool', nested_pool),
              ('concurrent_user_creation', concurrent_user_creation),
              ('cleanup_image_history', cleanup_image_history), ('rollback_text_scale', rollback_text_scale)]
    for name, check in checks:
        print(json.dumps({name: await check()}, ensure_ascii=False))

asyncio.run(main())
