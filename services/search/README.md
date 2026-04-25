# search

Search service — federated search, typeahead (STU-REQ-28..30).

## Run locally

```bash
uv sync
uv run uvicorn search.main:app --reload --port 38005
curl http://localhost:38005/health
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
