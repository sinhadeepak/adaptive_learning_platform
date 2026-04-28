"""End-to-end: hit a FastAPI app with the middleware mounted; assert the
trace-id is bound during the handler and echoed in the response header."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from alp_telemetry import TraceContextMiddleware, current_trace_id


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(TraceContextMiddleware)

    @app.get("/echo")
    async def echo() -> dict[str, str]:
        return {"trace_id": current_trace_id() or ""}

    return app


def test_inbound_traceparent_propagates_to_handler_and_response() -> None:
    inbound = "00-11111111111111111111111111111111-2222222222222222-01"
    with TestClient(_app()) as client:
        resp = client.get("/echo", headers={"traceparent": inbound})
    assert resp.status_code == 200
    assert resp.json()["trace_id"] == "1" * 32
    assert resp.headers["traceparent"].startswith("00-" + "1" * 32 + "-")


def test_missing_traceparent_generates_one() -> None:
    with TestClient(_app()) as client:
        resp = client.get("/echo")
    body = resp.json()
    assert len(body["trace_id"]) == 32
    assert resp.headers["traceparent"].startswith(f"00-{body['trace_id']}-")


def test_malformed_traceparent_falls_back_to_generated() -> None:
    with TestClient(_app()) as client:
        resp = client.get("/echo", headers={"traceparent": "garbage"})
    body = resp.json()
    assert len(body["trace_id"]) == 32
    # The garbage is dropped — we never echo it back unchanged.
    assert "garbage" not in resp.headers["traceparent"]


def test_two_requests_get_distinct_trace_ids() -> None:
    with TestClient(_app()) as client:
        a = client.get("/echo").json()["trace_id"]
        b = client.get("/echo").json()["trace_id"]
    assert a != b
