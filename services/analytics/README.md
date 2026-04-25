# analytics

Analytics service — EWA mastery, readiness score, streak tracking (STU-REQ-20, 23).

## Run locally

```bash
uv sync
uv run uvicorn analytics.main:app --reload --port 38006
curl http://localhost:38006/health
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
