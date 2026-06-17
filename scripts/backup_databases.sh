#!/usr/bin/env bash
# Complete database backup of the local Postgres cluster.
#
# Produces a timestamped directory under backups/ with:
#   - one custom-format dump per service DB (engagement, identity,
#     learning, marketplace, payment, quiz)
#   - a globals.sql dump (roles, grants — pg_dumpall --globals-only)
#   - a manifest.txt listing sizes + row-counts per DB
#   - a RESTORE.md with the exact restore commands
#
# Custom format (-Fc) is the production-grade format:
#   - parallel restore (`pg_restore -j`) when restoring a single DB
#   - selective table/schema restore via `-t`/`-n`
#   - smaller than plain SQL (compressed)
#
# Usage:
#   bash scripts/backup_databases.sh                 # writes to ./backups/<timestamp>/
#   BACKUP_DIR=/path bash scripts/backup_databases.sh
#
# Restore (full cluster):
#   bash scripts/restore_databases.sh ./backups/<timestamp>

set -euo pipefail

CONTAINER=${POSTGRES_CONTAINER:-alp-local-postgres-1}
PG_USER=${POSTGRES_USER:-postgres}
DBS=(engagement identity learning marketplace payment quiz)

TS=$(date +%Y%m%d_%H%M%S)
BACKUP_ROOT=${BACKUP_DIR:-$(pwd)/backups}
DEST="$BACKUP_ROOT/$TS"
mkdir -p "$DEST"

log() { printf "  ▶ %s\n" "$*"; }

echo "═══ Backup → $DEST ═══"

# Verify container is up
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "❌ container '$CONTAINER' not running" >&2
    exit 1
fi

# 0) refresh planner stats so row counts in manifest.txt are accurate
log "ANALYZE on each db (so manifest row counts are honest)"
for db in "${DBS[@]}"; do
    docker exec "$CONTAINER" psql -U "$PG_USER" -d "$db" -c "ANALYZE" >/dev/null 2>&1 || true
done

# 1) globals (roles + grants — needed if restoring to a fresh cluster)
log "globals.sql (roles + grants)"
docker exec "$CONTAINER" pg_dumpall -U "$PG_USER" --globals-only \
    > "$DEST/globals.sql"

# 2) per-DB custom-format dumps (parallel-restorable)
for db in "${DBS[@]}"; do
    log "$db.dump (custom format, compressed)"
    docker exec "$CONTAINER" pg_dump -U "$PG_USER" -d "$db" \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-acl \
        --quote-all-identifiers \
        > "$DEST/$db.dump"
done

# 3) manifest with sizes + headline row counts
{
    echo "Adaptive Learning Platform — DB backup manifest"
    echo "==============================================="
    echo "Timestamp: $TS"
    echo "Container: $CONTAINER"
    echo "Postgres : $(docker exec "$CONTAINER" psql -U "$PG_USER" -tAc 'SHOW server_version' | tr -d ' ')"
    echo
    echo "Files:"
    ls -lh "$DEST" | awk 'NR>1 {printf "  %-30s %s\n", $NF, $5}'
    echo
    echo "Per-DB headline row counts:"
    for db in "${DBS[@]}"; do
        echo
        echo "── $db ──"
        docker exec "$CONTAINER" psql -U "$PG_USER" -d "$db" -tAc "
            SELECT schemaname || '.' || relname || E'\t' || n_live_tup
              FROM pg_stat_user_tables
             WHERE n_live_tup > 0
             ORDER BY n_live_tup DESC
             LIMIT 15
        " 2>/dev/null | awk -F'\t' '{printf "  %-50s %10s\n", $1, $2}' || echo "  (no tables)"
    done
} > "$DEST/manifest.txt"

# 4) restore instructions, lock-stepped to this layout
cat > "$DEST/RESTORE.md" <<'EOF'
# Restore from this backup

## Quick restore (drops + recreates each DB)

```bash
bash scripts/restore_databases.sh BACKUP_DIR
```

(`BACKUP_DIR` = the directory containing this README, e.g. `backups/20260505_135500`.)

## Manual restore

### A. Restore globals (only when the cluster is brand-new)

```bash
docker exec -i alp-local-postgres-1 psql -U postgres < globals.sql
```

### B. Restore each DB

```bash
for db in engagement identity learning marketplace payment quiz; do
    # Drop existing (DESTRUCTIVE — only if you want a clean restore)
    docker exec alp-local-postgres-1 dropdb -U postgres --if-exists "$db"
    docker exec alp-local-postgres-1 createdb -U postgres "$db"

    # Restore from custom-format dump (-j 4 = 4 parallel workers)
    docker exec -i alp-local-postgres-1 pg_restore \
        -U postgres -d "$db" -j 4 --no-owner --no-acl < "${db}.dump"
done
```

### C. Selective restore (single table from one DB)

```bash
docker exec -i alp-local-postgres-1 pg_restore \
    -U postgres -d engagement \
    -t analytics_schema.mastery \
    < engagement.dump
```

### D. Inspect a dump's table-of-contents without restoring

```bash
docker exec -i alp-local-postgres-1 pg_restore --list < engagement.dump
```

## Notes
- Custom-format dumps (`*.dump`) include schema + data. They are NOT plain SQL.
- `globals.sql` is plain SQL (needed for roles/grants on a fresh cluster).
- `manifest.txt` records what was in the source cluster at backup time.
- Backups are NOT encrypted. Don't commit them. The repo `.gitignore` should
  cover `backups/` — verify with `git check-ignore -v backups/`.
EOF

# 5) Final size summary + checksums for tamper detection
log "computing checksums"
( cd "$DEST" && sha256sum globals.sql *.dump > SHA256SUMS )

echo
echo "═══ Done ═══"
du -sh "$DEST"
echo
echo "Files:"
ls -lh "$DEST" | tail -n +2

echo
echo "To restore: bash scripts/restore_databases.sh $DEST"
