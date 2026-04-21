# analytics

Analytics service — EWA mastery, readiness score, streak tracking (STU-REQ-20, 23).

## Run locally

```bash
uv sync
uv run uvicorn analytics.main:app --reload --port 8006
curl http://localhost:8006/health
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
