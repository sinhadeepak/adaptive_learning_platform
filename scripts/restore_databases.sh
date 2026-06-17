#!/usr/bin/env bash
# Restore from a backup produced by scripts/backup_databases.sh
#
# DESTRUCTIVE: drops + recreates each DB before loading the dump.
#
# Usage:
#   bash scripts/restore_databases.sh ./backups/20260505_135500
#   FORCE=1 bash scripts/restore_databases.sh ./backups/...     # skip confirm

set -euo pipefail

BACKUP_DIR=${1:-}
if [[ -z "$BACKUP_DIR" ]]; then
    echo "usage: $0 <backup-dir>" >&2
    exit 2
fi
if [[ ! -d "$BACKUP_DIR" ]]; then
    echo "❌ not a directory: $BACKUP_DIR" >&2
    exit 2
fi

CONTAINER=${POSTGRES_CONTAINER:-alp-local-postgres-1}
PG_USER=${POSTGRES_USER:-postgres}
DBS=(engagement identity learning marketplace payment quiz)
PARALLEL=${PARALLEL:-4}

# Verify dumps exist
missing=0
for db in "${DBS[@]}"; do
    if [[ ! -s "$BACKUP_DIR/${db}.dump" ]]; then
        echo "❌ missing or empty: $BACKUP_DIR/${db}.dump" >&2
        missing=1
    fi
done
[[ $missing -eq 1 ]] && exit 2

# Verify checksums if present
if [[ -f "$BACKUP_DIR/SHA256SUMS" ]]; then
    echo "▶ verifying SHA256SUMS"
    ( cd "$BACKUP_DIR" && sha256sum --quiet -c SHA256SUMS ) || {
        echo "❌ checksum mismatch — refusing to restore" >&2
        exit 3
    }
    echo "  checksums OK"
fi

# Big red button
echo
echo "═══ DESTRUCTIVE: this will drop + recreate ${#DBS[@]} databases ═══"
echo "  source : $BACKUP_DIR"
echo "  target : container $CONTAINER (postgres user $PG_USER)"
echo "  dbs    : ${DBS[*]}"
echo

if [[ "${FORCE:-0}" != "1" ]]; then
    read -r -p "Type 'yes' to proceed: " confirm
    [[ "$confirm" == "yes" ]] || { echo "aborted"; exit 1; }
fi

# Stop dependent services so they don't reconnect mid-restore
echo
echo "▶ stopping dependent services"
SVCS=(engagement learning quiz identity)
for s in "${SVCS[@]}"; do
    docker stop "alp-local-${s}-1" >/dev/null 2>&1 || true
done

# Restore loop
for db in "${DBS[@]}"; do
    echo
    echo "── $db ──"
    echo "  dropping + recreating"
    docker exec "$CONTAINER" dropdb -U "$PG_USER" --if-exists "$db"
    docker exec "$CONTAINER" createdb -U "$PG_USER" "$db"

    echo "  restoring (j=$PARALLEL)"
    # Stream the custom-format dump into pg_restore.
    docker exec -i "$CONTAINER" pg_restore \
        -U "$PG_USER" -d "$db" \
        -j "$PARALLEL" \
        --no-owner --no-acl \
        --exit-on-error \
        < "$BACKUP_DIR/${db}.dump"

    rows=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$db" -tAc \
        "SELECT COALESCE(SUM(n_live_tup), 0) FROM pg_stat_user_tables")
    echo "  ✓ $db restored — $rows total live rows"
done

# Restart services
echo
echo "▶ restarting services"
for s in "${SVCS[@]}"; do
    docker start "alp-local-${s}-1" >/dev/null 2>&1 || true
done

echo
echo "═══ Restore complete ═══"
echo "Verify with:"
echo "  bash scripts/smoke_test_analytics.sh"
