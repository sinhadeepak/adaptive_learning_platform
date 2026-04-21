# content

Content service — question, explanation, media management (EXP-REQ + MOD-REQ).

## Run locally

```bash
uv sync
uv run uvicorn content.main:app --reload --port 8003
curl http://localhost:8003/health
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
