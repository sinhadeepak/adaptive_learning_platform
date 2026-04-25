# adaptive-engine

Adaptive Engine — 3PL IRT model, gRPC API, readiness scoring.

> **Sprint 0 scope**: HTTP `/health` skeleton only on port 8010. gRPC server + proto definitions land in Sprint 1 via SPIKE-01 (IRT calibration) and SPIKE-07 (NATS partition strategy). Keep gRPC deps out of `pyproject.toml` until the spike picks a framework.

## Run locally

```bash
uv sync
uv run uvicorn adaptive_engine.main:app --reload --port 38010
curl http://localhost:38010/health
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
