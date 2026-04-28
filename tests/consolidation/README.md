# Consolidation contract tests

Per-route parity tests that gate the cutover during the 12 → 5 service
consolidation defined in [ADR-0005](../../docs/adr/0005-service-consolidation.md).

## What this is

Each old service has a recorded route inventory. For every route we capture:

1. The HTTP method, path, and a representative request body.
2. The response status, headers we care about, and the response body
   (with volatile fields like timestamps and uuids stripped or normalised).

We then call the *new* (consolidated) service against the same fixture and assert byte-for-byte parity.

If a contract test fails for a given old service, **do not delete that
service yet** — fix the new service until parity holds.

## Layout

```
tests/consolidation/
├── README.md                 — this file
├── conftest.py               — shared fixtures (clients, normalisers)
├── inventory.py              — single source of truth for the route list per old service
├── recordings/               — captured request/response fixtures (created in step 1)
│   ├── analytics/
│   ├── notification/
│   ├── catalog/
│   ├── content/
│   ├── doubts/
│   ├── search/
│   ├── adaptive_engine/
│   ├── auth/
│   ├── user_profile/
│   └── institution/
├── record.py                 — `python -m tests.consolidation.record <old_service>` — hits the
│                               old service (must be running on its usual port) and writes
│                               recordings/<old_service>/*.json
├── test_engagement.py        — replays analytics + notification recordings against alp-engagement
├── test_learning.py          — replays catalog + content + doubts + search + adaptive recordings
└── test_identity.py          — replays auth + user-profile + institution recordings
```

## Workflow per merge sprint

```
# 1. Boot the old stack (12 services).
make dev

# 2. Capture recordings for the old services in this sprint's bundle.
uv run python -m tests.consolidation.record analytics notification

# 3. Bring up the new consolidated stack.
make dev-new

# 4. Run the contract tests for this bundle.
pytest tests/consolidation/test_engagement.py -v

# 5. If green: cut traffic, delete the old services. If red: fix the
#    new service and re-run.
```

## Recording format

```json
{
  "old_service": "analytics",
  "route_key": "GET /analytics/cohorts/{cohortId}/leaderboard",
  "request": {
    "method": "GET",
    "path": "/analytics/cohorts/c1/leaderboard",
    "headers": {"authorization": "Bearer <fixture-jwt>"},
    "body": null
  },
  "response": {
    "status": 200,
    "body": {
      "cohortId": "c1",
      "leaderboard": [
        {"userId": "<uuid>", "score": 0.72, "rank": 1, "updatedAt": "<ts>"}
      ]
    }
  }
}
```

## Normalisation

The shared normaliser in `conftest.py::normalise_response` strips:

- All `created_at`, `updated_at`, `submittedAt`, `iat`, `exp` timestamps.
- All `id` fields except top-level keys (where their *presence* is asserted).
- All `traceparent` echo headers.
- The `Date`, `Server`, `Content-Length` HTTP headers.

Anything else must match exactly. If you find a legitimate response-shape
difference (e.g. the new service returns the same fields in a different
key order — JSON object key order is not significant but our diff is
order-stable) extend the normaliser, don't loosen the assertion.
