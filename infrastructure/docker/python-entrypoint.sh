#!/usr/bin/env sh
# Run alembic migration if the service has one, then launch uvicorn.
# SERVICE_DIR + APP_MODULE are baked into the image at build time.

set -e

cd "$SERVICE_DIR"

if [ -f "alembic.ini" ]; then
  echo "→ running alembic upgrade head for $APP_MODULE"
  if [ -z "$DATABASE_URL" ]; then
    # Fall back to per-service env var if the generic one isn't set.
    SVC_UPPER=$(echo "$APP_MODULE" | cut -d. -f1 | tr 'a-z' 'A-Z' | tr '-' '_')
    URL_VAR="${SVC_UPPER}_DATABASE_URL"
    eval "DATABASE_URL=\${$URL_VAR}"
    export DATABASE_URL
  fi
  if [ -z "$DATABASE_URL" ]; then
    echo "✗ DATABASE_URL not set; skipping migration"
  else
    alembic upgrade head
  fi
fi

echo "→ launching uvicorn $APP_MODULE:app on :8000"
exec uvicorn "$APP_MODULE:app" --host 0.0.0.0 --port 8000
