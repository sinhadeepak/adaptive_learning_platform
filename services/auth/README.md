# auth

Auth service — registration, OTP, JWT, refresh (STU-REQ-01..08).

## Run locally

```bash
uv sync
uv run uvicorn auth.main:app --reload --port 8001
curl http://localhost:8001/health
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
