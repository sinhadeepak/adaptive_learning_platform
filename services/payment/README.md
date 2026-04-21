# payment

Payment service — subscriptions, in-app purchases, receipts.

## Run locally

```bash
uv sync
uv run uvicorn payment.main:app --reload --port 8007
curl http://localhost:8007/health
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
