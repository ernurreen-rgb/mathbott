"""Restore real custom-format archives, and reject unsafe/corrupt targets."""
import asyncio
import json
import os
from uuid import uuid4

import psycopg
from psycopg import sql
import pytest

from database import Database
from scripts.postgres_backup import BackupError, backup, connection_info, identity, restore, restore_preflight


def test_explicit_direct_urls_do_not_echo_credentials():
    for value in (None, '', 'postgresql://user:private-password@localhost',
                  'postgresql://user:private-password@ep-test-pooler.example.neon.tech/db'):
        with pytest.raises(BackupError) as error:
            connection_info(value)
        assert 'private-password' not in str(error.value)


def test_drill_rejects_production_names_and_same_database_without_connecting():
    source = 'postgresql://user:private-password@localhost/mathbot_restore_source'
    manifest = {'source_identity_sha256': identity(source)}
    with pytest.raises(BackupError, match='dedicated'):
        restore_preflight('postgresql://user:private-password@localhost/neondb', manifest)
    with pytest.raises(BackupError, match='different databases'):
        restore_preflight(source, manifest)


def test_corrupt_bundle_is_rejected_before_target_connection(tmp_path):
    (tmp_path / 'database.dump').write_bytes(b'incomplete archive')
    (tmp_path / 'manifest.json').write_text(json.dumps({'format_version': 1, 'dump_sha256': 'invalid'}))
    with pytest.raises(BackupError, match='checksum'):
        restore('postgresql://user:private-password@invalid.invalid/mathbot_restore_target', tmp_path, apply=True)


@pytest.fixture
def restore_databases():
    url = os.environ.get('MATHBOT_RESTORE_ADMIN_URL')
    if not url:
        pytest.skip('Set MATHBOT_RESTORE_ADMIN_URL to a disposable local PostgreSQL server')
    info = connection_info(url)
    if info['host'] not in ('127.0.0.1', 'localhost', '::1'):
        pytest.fail('Restore integration fixtures only create/drop databases on loopback')
    names = [f'mathbot_restore_{kind}_{uuid4().hex}' for kind in ('source', 'target')]
    created = []
    try:
        with psycopg.connect(url, autocommit=True) as admin:
            for name in names:
                admin.execute(sql.SQL('CREATE DATABASE {} TEMPLATE template0').format(sql.Identifier(name)))
                created.append(name)
        # Convert back to explicit URIs: the operational guard deliberately rejects service DSNs.
        from urllib.parse import quote, urlsplit, urlunsplit
        parts = urlsplit(url)
        yield tuple(urlunsplit(parts._replace(path='/' + quote(name))) for name in names)
    finally:
        with psycopg.connect(url, autocommit=True) as admin:
            for name in created:
                assert name.startswith('mathbot_restore_')
                admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))


async def seed_source(url):
    db = Database(url, use_pool=False, auto_migrate=True)
    await db.init()
    user = await db.users.create_user_by_email('оқушы@restore.invalid')
    await db.users.update_user_nickname(user['email'], 'Әлібек')
    quiz = await db.quizzes.create_quiz(title='Қалпына келтіру', created_by=user['id'])
    question = await db.quizzes.add_question(quiz_id=quiz['id'], question_text='2 + 2',
                                           question_type='input', correct_answer='4', time_limit_seconds=300)
    session = await db.quizzes.create_session(quiz['id'], user['id'])
    player = await db.quizzes.join_session(session['id'], 'Сынақ оқушысы')
    await db.quizzes.update_session_status(session['id'], 'in_progress')
    await db.quizzes.activate_question(session['id'], player['participant_token'])
    await db.quizzes.record_answer(session['id'], player['id'], question['id'], '4', player['participant_token'])
    return user, quiz


def test_real_backup_restore_checks_rows_schema_migrations_and_sequences(restore_databases, tmp_path, monkeypatch):
    source, target = restore_databases
    original, quiz = asyncio.run(seed_source(source))
    bundle = tmp_path / 'bundle'
    clients = os.environ.get('MATHBOT_PG_BIN')
    from scripts import postgres_backup
    run_client = postgres_backup.run_client

    def live_write_after_manifest(executable, args, *rest, **kwargs):
        if '--snapshot' in args:
            with psycopg.connect(source) as writer:
                writer.execute("UPDATE users SET nickname='Snapshot-тен кейін' WHERE id=%s", (original['id'],))
        return run_client(executable, args, *rest, **kwargs)

    monkeypatch.setattr(postgres_backup, 'run_client', live_write_after_manifest)
    manifest = backup(source, bundle, clients)
    assert manifest['tables']['quiz_answers']['rows'] == 1
    assert manifest['tables']['users']['rows'] == 1
    assert 'private-password' not in json.dumps(manifest)
    assert 'postgresql://' not in (bundle / 'manifest.json').read_text(encoding='utf-8')
    assert restore(target, bundle, pg_bin=clients) == {'applied': False, 'empty_target_verified': True}
    with psycopg.connect(target) as connection:
        assert connection.execute("SELECT to_regclass('public.users')").fetchone()[0] is None
    result = restore(target, bundle, apply=True, pg_bin=clients)
    assert result['content_verified'] and result['schema_verified'] and result['migration_checksums_verified']
    assert result['sequences_verified'] > 0
    restored = Database(target, use_pool=False, auto_migrate=False)
    user = asyncio.run(restored.users.get_user_by_email(original['email']))
    assert user['id'] == original['id'] and user['nickname'] == 'Әлібек'
    assert asyncio.run(restored.quizzes.get_quiz_by_id(quiz['id']))['title'] == 'Қалпына келтіру'
    next_user = asyncio.run(restored.users.create_user_by_email('next@restore.invalid'))
    assert next_user['id'] > original['id']
    # Writes to the restored database do not affect the source.
    with psycopg.connect(source) as connection:
        assert connection.execute('SELECT count(*) FROM users').fetchone()[0] == 1
        assert connection.execute('SELECT nickname FROM users WHERE id=%s', (original['id'],)).fetchone()[0] == 'Snapshot-тен кейін'
    with pytest.raises(BackupError, match='not empty'):
        restore(target, bundle, apply=True, pg_bin=clients)
    with pytest.raises(FileExistsError):
        backup(source, bundle, clients)


def test_existing_empty_table_is_not_overwritten(restore_databases, tmp_path):
    source, target = restore_databases
    asyncio.run(seed_source(source))
    clients = os.environ.get('MATHBOT_PG_BIN')
    backup(source, tmp_path / 'bundle', clients)
    with psycopg.connect(target) as connection:
        connection.execute('CREATE TABLE sentinel (id bigint primary key)')
    with pytest.raises(BackupError, match='not empty'):
        restore(target, tmp_path / 'bundle', apply=True, pg_bin=clients)
    with psycopg.connect(target) as connection:
        assert connection.execute('SELECT count(*) FROM sentinel').fetchone()[0] == 0


def test_restore_error_rolls_back_objects_created_before_a_late_conflict(restore_databases, tmp_path, monkeypatch):
    source, target = restore_databases
    asyncio.run(seed_source(source))
    clients = os.environ.get('MATHBOT_PG_BIN')
    backup(source, tmp_path / 'bundle', clients)
    from scripts import postgres_backup
    run_client = postgres_backup.run_client

    def concurrent_target_change(executable, args, *rest, **kwargs):
        if '--single-transaction' in args:
            # Another actor writes after preflight. pg_restore must fail without
            # leaving any of its earlier DDL/data behind or modifying this row.
            with psycopg.connect(target) as writer:
                writer.execute('CREATE TABLE users (sentinel text)')
                writer.execute("INSERT INTO users VALUES ('preserve me')")
        return run_client(executable, args, *rest, **kwargs)

    monkeypatch.setattr(postgres_backup, 'run_client', concurrent_target_change)
    with pytest.raises(BackupError, match='pg_restore failed'):
        restore(target, tmp_path / 'bundle', apply=True, pg_bin=clients)
    with psycopg.connect(target) as connection:
        assert connection.execute('SELECT sentinel FROM users').fetchall() == [('preserve me',)]
        assert connection.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'").fetchall() == [('users',)]
        assert connection.execute("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'").fetchone()[0] == 0
