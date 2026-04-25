# catalog

Catalog service — Exam→Subject→Topic hierarchy (STU-REQ-24..27).

## Run locally

```bash
uv sync
uv run uvicorn catalog.main:app --reload --port 38004
curl http://localhost:38004/health
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
