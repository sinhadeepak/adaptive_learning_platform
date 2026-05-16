#!/usr/bin/env bash
# Assign every TEACHER / MODERATOR / EXPERT in the identity DB to every
# published exam in the learning DB, wide-scope (subject_id IS NULL).
#
# Why this exists: the educator scope endpoint
# (/api/v1/catalog/educators/me/exams) returns only exams the caller has
# an explicit catalog_schema.educator_assignments row for. The seeded
# users start with no rows, so the teacher's question-author page shows
# an empty exam dropdown. This script keeps the demo accounts walkable
# end-to-end through `make seed-restore` without forcing the admin
# through the Educator-scope UI every time a re-seed happens.
#
# Idempotent — UNIQUE (educator_id, exam_id) WHERE subject_id IS NULL
# means re-runs are no-ops.

set -euo pipefail

CONTAINER=${POSTGRES_CONTAINER:-alp-local-postgres-1}
PG_USER=${POSTGRES_USER:-postgres}
PG_PW=${POSTGRES_PASSWORD:-postgres}

# Pull the educator UUIDs out of the identity DB.
EDUCATOR_IDS=$(
  docker exec -e PGPASSWORD="$PG_PW" "$CONTAINER" \
    psql -U "$PG_USER" -d identity -t -A -c \
    "SELECT id FROM auth_schema.users WHERE role IN ('TEACHER','MODERATOR','EXPERT');"
)

if [[ -z "$EDUCATOR_IDS" ]]; then
  echo "  ↳ no TEACHER/MODERATOR/EXPERT users seeded — skipping."
  exit 0
fi

# Build the VALUES list (one (uuid) tuple per educator).
VALUES=""
for uid in $EDUCATOR_IDS; do
  if [[ -n "$VALUES" ]]; then VALUES+=", "; fi
  VALUES+="('$uid'::uuid)"
done

# Insert wide-scope rows for every exam × educator. ON CONFLICT DO NOTHING
# trivially handles existing rows. We read the count off psql's command
# tag instead of `wc -l` on RETURNING — psql appends a trailing newline
# even on zero-row output, which makes wc -l report 1 for an idempotent
# re-run.
out=$(
  docker exec -e PGPASSWORD="$PG_PW" "$CONTAINER" \
    psql -U "$PG_USER" -d learning -X -c "
      INSERT INTO catalog_schema.educator_assignments (educator_id, exam_id, created_by)
      SELECT u.id, e.id, u.id
      FROM (VALUES $VALUES) AS u(id)
      CROSS JOIN catalog_schema.exams e
      ON CONFLICT DO NOTHING;
    "
)
inserted=$(echo "$out" | sed -n 's/^INSERT 0 //p' | tail -1)
inserted=${inserted:-0}

echo "  ↳ inserted $inserted new wide-scope assignments (idempotent)."
