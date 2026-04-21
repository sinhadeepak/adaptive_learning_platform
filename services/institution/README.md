# institution

Institution service — school/coaching-center cohorts and dashboards.

## Run locally

```bash
uv sync
uv run uvicorn institution.main:app --reload --port 8008
curl http://localhost:8008/health
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
