#!/usr/bin/env sh
# Apply migrations if present, then launch the service binary.
# Both are built and shipped in /app (named by $SERVICE_NAME and `migrate`).

set -e

if [ -f /app/migrate ] && [ -d /app/migrations ]; then
  echo "→ running golang-migrate up"
  /app/migrate up || true
fi

echo "→ launching /app/$SERVICE_NAME"
exec /app/"$SERVICE_NAME"
