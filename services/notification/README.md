# notification

Notification service — push/SMS/email, channel flags (GAP-16).

## Run locally

```bash
uv sync
uv run uvicorn notification.main:app --reload --port 38009
curl http://localhost:38009/health
```

## Test

```bash
uv run pytest
```

## Lint

```bash
uv run ruff check .
uv run ruff format --check .
```
