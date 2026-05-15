#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.nginx.hub.yml}"
SERVICE="${SERVICE:-backend}"
DB_PATH="${DB_PATH:-/data/mathbot.db}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
container_backup="/tmp/mathbot-${stamp}.db"
output_path="$BACKUP_DIR/mathbot-${stamp}.db"

cd "$PROJECT_DIR"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e DB_PATH="$DB_PATH" \
  -e BACKUP_PATH="$container_backup" \
  "$SERVICE" python - <<'PY'
import os
import sqlite3

source = os.environ["DB_PATH"]
destination = os.environ["BACKUP_PATH"]

src = sqlite3.connect(source)
dst = sqlite3.connect(destination)
try:
    with dst:
        src.backup(dst)
finally:
    dst.close()
    src.close()
PY

container_id="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q "$SERVICE")"
docker cp "${container_id}:${container_backup}" "$output_path"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T "$SERVICE" rm -f "$container_backup" >/dev/null

gzip -f "$output_path"
find "$BACKUP_DIR" -name 'mathbot-*.db.gz' -type f -mtime +"$RETENTION_DAYS" -delete

echo "$output_path.gz"
