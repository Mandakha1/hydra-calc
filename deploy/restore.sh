#!/usr/bin/env bash
# Restore a pg_dump snapshot. Usage: ./restore.sh backups/hydra_YYYYMMDD_HHMMSS.dump
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <dump-file>"
  exit 1
fi
DUMP="$1"
if [[ ! -f "$DUMP" ]]; then
  echo "not found: $DUMP"
  exit 1
fi

COMPOSE_DIR="${COMPOSE_DIR:-/opt/hydra-calc/deploy}"
cd "${COMPOSE_DIR}"

read -p "⚠  This will DROP all existing data in 'hydra' database and replace it with $DUMP. Continue? (yes/no) " ans
if [[ "$ans" != "yes" ]]; then
  echo "aborted"
  exit 1
fi

# Drop & recreate database
docker compose exec -T postgres psql -U hydra -d postgres -c "DROP DATABASE IF EXISTS hydra;"
docker compose exec -T postgres psql -U hydra -d postgres -c "CREATE DATABASE hydra OWNER hydra;"

# Restore
docker compose exec -T postgres pg_restore -U hydra -d hydra --clean --if-exists --no-owner < "$DUMP"

echo "✓ restored from $DUMP"
