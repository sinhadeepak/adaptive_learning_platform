"""Sprint 15 (P3-S0): only the skeleton's health probes are testable.
Real domain tests land in P3-S1+ once tutor profiles arrive."""

from fastapi.testclient import TestClient

from marketplace.main import app


def test_health_returns_ok() -> None:
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "marketplace"


def test_ready_returns_ready() -> None:
    with TestClient(app) as client:
        resp = client.get("/ready")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"
