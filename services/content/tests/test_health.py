from fastapi.testclient import TestClient

from content.main import app


def test_health_returns_ok() -> None:
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "content"


def test_ready_returns_ready() -> None:
    with TestClient(app) as client:
        resp = client.get("/ready")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"
