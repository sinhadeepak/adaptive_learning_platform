#!/usr/bin/env bash
# Creates one database per service, matching Aurora's 9-schema layout in staging.
# Triggered by Postgres container on first run (POSTGRES_MULTIPLE_DATABASES env).
set -euo pipefail

DBS="${POSTGRES_MULTIPLE_DATABASES:-}"
if [ -z "$DBS" ]; then
  echo "POSTGRES_MULTIPLE_DATABASES not set — nothing to do."
  exit 0
fi

IFS=',' read -ra ARR <<< "$DBS"
for db in "${ARR[@]}"; do
  echo "Creating database: $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE "$db";
    GRANT ALL PRIVILEGES ON DATABASE "$db" TO "$POSTGRES_USER";
EOSQL
done
