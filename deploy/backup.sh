#!/usr/bin/env bash
# Nightly PostgreSQL backup — called from cron as ubuntu user.
# Retains 14 days of snapshots locally; optionally uploads to Oracle Object Storage (also Always Free).
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/hydra-calc/deploy}"
BACKUP_DIR="${BACKUP_DIR:-${COMPOSE_DIR}/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
TS=$(date +%Y%m%d_%H%M%S)
OUT="${BACKUP_DIR}/hydra_${TS}.dump"

mkdir -p "${BACKUP_DIR}"

cd "${COMPOSE_DIR}"
docker compose exec -T postgres pg_dump -U hydra -Fc -Z 6 hydra > "${OUT}"

# Sanity — the dump header starts with PGDMP
if ! head -c 5 "${OUT}" | grep -q "PGDMP"; then
  echo "[backup] ERROR: dump does not look valid, aborting retention prune"
  exit 1
fi

# Retention
find "${BACKUP_DIR}" -name "hydra_*.dump" -mtime "+${RETAIN_DAYS}" -delete

# Optional: Oracle Object Storage upload (install oci-cli and configure ~/.oci/config)
if command -v oci >/dev/null 2>&1 && [[ -n "${OCI_BUCKET:-}" ]]; then
  oci os object put \
    --bucket-name "${OCI_BUCKET}" \
    --file "${OUT}" \
    --name "hydra_${TS}.dump" \
    --force
fi

SIZE=$(du -h "${OUT}" | cut -f1)
echo "[backup] ok: ${OUT} (${SIZE})"
