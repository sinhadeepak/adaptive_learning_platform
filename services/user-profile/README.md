# user-profile

User profile service — onboarding FSM, exam selection, JWT claim propagation (STU-REQ-53..58).

## Run locally

```bash
uv sync
uv run uvicorn user_profile.main:app --reload --port 8002
curl http://localhost:8002/health
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
