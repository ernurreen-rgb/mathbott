"""Consistent public-schema backups and restore drills into empty test databases.

Connection URLs come only from MATHBOT_BACKUP_SOURCE_URL / MATHBOT_RESTORE_TARGET_URL.
This script does not load dotenv files or fall back to the application's database.
"""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict


class BackupError(RuntimeError):
    """Operator-facing error whose message contains no connection credentials."""


def connection_info(url):
    if not url or not url.startswith(('postgresql://', 'postgres://')):
        raise BackupError('An explicit PostgreSQL URL is required')
    try:
        info = conninfo_to_dict(url)
    except Exception:
        raise BackupError('Invalid PostgreSQL URL') from None
    if not info.get('host') or not info.get('dbname'):
        raise BackupError('Explicit host and database name are required')
    if '-pooler.' in info['host']:
        raise BackupError('Use a direct connection, not a Neon pooler endpoint')
    if any(key in info for key in ('service', 'options', 'hostaddr')):
        raise BackupError('Service, hostaddr and custom connection options are not supported')
    return info


def identity(url):
    info = connection_info(url)
    value = [info['host'].lower(), info.get('port', '5432'), info['dbname']]
    return sha256(json.dumps(value).encode()).hexdigest()


def connect(url):
    connection_info(url)
    return psycopg.connect(url, connect_timeout=15, options=(
        '-c default_transaction_read_only=on -c timezone=UTC '
        '-c search_path=public,pg_catalog -c extra_float_digits=3'
    ))


def tool(name, pg_bin=None):
    found = str(Path(pg_bin) / (name + ('.exe' if os.name == 'nt' else ''))) if pg_bin else shutil.which(name)
    if not found or not Path(found).is_file():
        raise BackupError(f'{name} is unavailable; install PostgreSQL clients or pass --pg-bin')
    return found


def run_client(executable, args, url=None, read_only=False):
    # URLs/passwords stay out of argv and all client output is captured, never logged.
    env = {key: value for key, value in os.environ.items() if not key.upper().startswith('PG')}
    if url:
        variables = {option.keyword.decode(): option.envvar.decode() for option in psycopg.pq.Conninfo.get_defaults()
                     if option.envvar}
        for key, value in connection_info(url).items():
            if key not in variables:
                raise BackupError('Unsupported client connection parameter')
            env[variables[key]] = value
    env['PGCONNECT_TIMEOUT'] = '15'
    if read_only:
        env['PGOPTIONS'] = '-c default_transaction_read_only=on'
    result = subprocess.run([executable, *map(str, args)], env=env, capture_output=True,
                            text=True, encoding='utf-8', errors='replace', timeout=1800)
    if result.returncode:
        raise BackupError(f'{Path(executable).stem} failed (client details suppressed to protect credentials)')
    return result.stdout


def client_major(executable):
    output = run_client(executable, ['--version'])
    match = re.search(r'\(PostgreSQL\) (\d+)', output)
    if not match:
        raise BackupError('Unable to identify PostgreSQL client version')
    return int(match[1])


def file_digest(path):
    digest = sha256()
    with Path(path).open('rb') as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def migrations(connection):
    actual = dict(connection.execute('SELECT version, checksum FROM public.mathbot_schema_migrations ORDER BY version'))
    expected = {path.stem: sha256(path.read_text(encoding='utf-8').encode()).hexdigest()
                for path in (Path(__file__).resolve().parents[1] / 'migrations/postgres').glob('*.sql')}
    if actual != expected:
        raise BackupError('Database migration versions/checksums do not match this checkout')
    return actual


def schema_definitions(connection):
    definitions = {}
    queries = {
        # pg_dump compacts dropped-column attnum gaps. Compare live column order,
        # rather than the source's historical physical slot numbers.
        'columns': """SELECT table_name, column_name,
            row_number() OVER (PARTITION BY table_name ORDER BY ordinal_position), data_type, udt_name,
            is_nullable, column_default, is_identity, identity_generation, identity_start, identity_increment
            FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position""",
        'constraints': """SELECT c.relname, x.conname, pg_get_constraintdef(x.oid, true)
            FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' ORDER BY c.relname, x.conname""",
        'indexes': "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname",
        'functions': """SELECT p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname, 2""",
        'views': "SELECT viewname, definition FROM pg_views WHERE schemaname='public' ORDER BY viewname",
        'triggers': """SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid, true) FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname, t.tgname""",
        'sequences': """SELECT sequencename, data_type::text, start_value, min_value, max_value,
            increment_by, cycle, cache_size FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename""",
    }
    for key, query in queries.items():
        definitions[key] = connection.execute(query).fetchall()
    return definitions


def fingerprint(connection):
    """Hash schema definitions and canonical rows under the caller's snapshot."""
    definitions = schema_definitions(connection)
    schema_digest = sha256(json.dumps(definitions, ensure_ascii=False, default=str).encode()).hexdigest()
    tables = {}
    names = connection.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").fetchall()
    for index, (name,) in enumerate(names):
        digest, count = sha256(), 0
        with connection.cursor(name=f'backup_rows_{index}') as cursor:
            cursor.execute(sql.SQL('SELECT to_jsonb(r)::text FROM {} r ORDER BY to_jsonb(r)::text COLLATE "C"')
                           .format(sql.Identifier('public', name)))
            for (record,) in cursor:
                value = record.encode('utf-8')
                digest.update(len(value).to_bytes(8, 'big'))
                digest.update(value)
                count += 1
        tables[name] = {'rows': count, 'sha256': digest.hexdigest()}
    return {'schema_sha256': schema_digest, 'tables': tables, 'migrations': migrations(connection)}


def backup(source_url, output, pg_bin=None):
    source_identity = identity(source_url)
    pg_dump = tool('pg_dump', pg_bin)
    dump_major = client_major(pg_dump)
    output = Path(output).resolve()
    # Exclusive directory creation prevents silent overwrite or reuse of partial bundles.
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    archive = output / 'database.dump'
    with connect(source_url) as connection:
        connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        server_major = int(connection.info.server_version) // 10000
        if dump_major < server_major:
            raise BackupError('pg_dump must be at least as new as the source server')
        snapshot, snapshot_at = connection.execute('SELECT pg_export_snapshot(), clock_timestamp()').fetchone()
        state = fingerprint(connection)
        # The dump imports the SAME snapshot as the manifest, including during live writes.
        run_client(pg_dump, ['--format=custom', '--schema=public', '--no-owner', '--no-privileges',
                            '--lock-wait-timeout=15s', '--snapshot', snapshot, '--file', archive],
                   source_url, read_only=True)
        database = connection.execute('SELECT current_database()').fetchone()[0]
    manifest = {'format_version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
                'snapshot_at': snapshot_at.isoformat(),
                'source_identity_sha256': source_identity, 'source_database': database,
                'server_major': server_major, 'pg_dump_major': dump_major,
                'dump_sha256': file_digest(archive), **state}
    archive.chmod(0o600)
    manifest_path = output / 'manifest.json'
    with manifest_path.open('x', encoding='utf-8') as destination:
        json.dump(manifest, destination, ensure_ascii=False, indent=2)
    manifest_path.chmod(0o600)
    return manifest


def restore_preflight(target_url, manifest):
    info = connection_info(target_url)
    if not re.fullmatch(r'mathbot_restore_[a-z0-9_]+', info['dbname']):
        raise BackupError('Restore drills require a dedicated mathbot_restore_* database')
    if identity(target_url) == manifest['source_identity_sha256']:
        raise BackupError('Source and restore target must be different databases')
    with connect(target_url) as connection:
        if int(connection.info.server_version) // 10000 < manifest['pg_dump_major']:
            raise BackupError('Restore server must be at least as new as pg_dump')
        database = connection.execute('SELECT current_database()').fetchone()[0]
        if database != info['dbname']:
            raise BackupError('Resolved target database does not match the explicit URL')
        objects = connection.execute("""SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
            AND n.nspname NOT LIKE 'pg_temp_%'""").fetchone()[0]
        functions = connection.execute("""SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname NOT IN ('pg_catalog','information_schema')""").fetchone()[0]
        if objects or functions:
            raise BackupError('Restore target is not empty; no objects or rows will be overwritten')
        if not connection.execute("SELECT to_regnamespace('public') IS NOT NULL").fetchone()[0]:
            raise BackupError('Empty target must have its default public schema')


def verify_sequences(connection):
    checked = 0
    columns = connection.execute("""SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND (is_identity='YES' OR column_default LIKE 'nextval(%')
        ORDER BY table_name, ordinal_position""").fetchall()
    for table, column in columns:
        sequence = connection.execute('SELECT pg_get_serial_sequence(%s, %s)', (f'public.{table}', column)).fetchone()[0]
        last_value, called = connection.execute(sql.SQL('SELECT last_value, is_called FROM {}')
                                                .format(sql.Identifier(*sequence.split('.')))).fetchone()
        maximum = connection.execute(sql.SQL('SELECT max({}) FROM {}')
                                     .format(sql.Identifier(column), sql.Identifier('public', table))).fetchone()[0]
        if maximum is not None and (last_value < maximum or (last_value == maximum and not called)):
            raise BackupError('Restored identity sequence could reuse an existing ID')
        checked += 1
    return checked


def restore(target_url, bundle, apply=False, pg_bin=None):
    bundle = Path(bundle).resolve()
    manifest = json.loads((bundle / 'manifest.json').read_text(encoding='utf-8'))
    archive = bundle / 'database.dump'
    if manifest.get('format_version') != 1 or file_digest(archive) != manifest['dump_sha256']:
        raise BackupError('Backup file checksum/format mismatch; restore refused')
    restore_preflight(target_url, manifest)
    if not apply:
        return {'applied': False, 'empty_target_verified': True}
    pg_restore = tool('pg_restore', pg_bin)
    if client_major(pg_restore) < manifest['pg_dump_major']:
        raise BackupError('pg_restore is older than the backup client')
    # A freshly created database already owns public. Skip only its CREATE SCHEMA
    # TOC entry; retain all application objects and restore them in ONE transaction.
    contents = run_client(pg_restore, ['--list', archive])
    lines = [line for line in contents.splitlines()
             if not re.match(r'^\d+; \d+ \d+ SCHEMA - public ', line)]
    with tempfile.TemporaryDirectory(prefix='mathbot-restore-toc-') as directory:
        listing = Path(directory) / 'restore.list'
        listing.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        run_client(pg_restore, ['--dbname', connection_info(target_url)['dbname'],
                               '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges',
                               '--no-tablespaces', '--use-list', listing, archive], target_url)
    with connect(target_url) as connection:
        connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        actual = fingerprint(connection)
        for key in ('tables', 'schema_sha256', 'migrations'):
            if actual[key] != manifest[key]:
                raise BackupError(f'Restored {key} verification failed; keep target isolated for inspection')
        sequences = verify_sequences(connection)
    return {'applied': True, 'content_verified': True, 'schema_verified': True,
            'migration_checksums_verified': True, 'sequences_verified': sequences,
            'tables_verified': len(actual['tables']), 'rows_verified': sum(t['rows'] for t in actual['tables'].values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', help='Directory containing pg_dump and pg_restore')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('backup').add_argument('--output', required=True, help='New private backup directory')
    check = commands.add_parser('restore')
    check.add_argument('--backup', required=True, help='Directory containing database.dump and manifest.json')
    check.add_argument('--apply', action='store_true', help='Restore after validating the empty test target')
    args = parser.parse_args()
    try:
        if args.command == 'backup':
            manifest = backup(os.environ.get('MATHBOT_BACKUP_SOURCE_URL'), args.output, args.pg_bin)
            result = {'backup_created': True, 'tables': len(manifest['tables']),
                      'rows': sum(table['rows'] for table in manifest['tables'].values())}
        else:
            result = restore(os.environ.get('MATHBOT_RESTORE_TARGET_URL'), args.backup, args.apply, args.pg_bin)
        print(json.dumps(result))
    except Exception as error:
        detail = str(error) if isinstance(error, BackupError) else 'Operation failed; connection details suppressed'
        print(json.dumps({'status': 'failed', 'error_type': type(error).__name__, 'detail': detail}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
