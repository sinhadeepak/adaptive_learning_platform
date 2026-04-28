"""Contract parity tests for alp-engagement (Sprint B target).

These run AFTER `record.py` has captured fixtures from the old
analytics + notification services. They replay each captured request
against the new alp-engagement service and assert the response body
matches (modulo volatile fields like timestamps and uuids).

Notification has no public HTTP routes — its parity is gated by the
JetStream durable consumer assertion at the bottom of this file.
"""

from __future__ import annotations

import os

import httpx
import pytest

from tests.consolidation.conftest import normalise_response
from tests.consolidation.inventory import ROUTES


@pytest.fixture(scope="module")
def new_service_url() -> str:
    return os.environ.get("ENGAGEMENT_BASE_URL", "http://localhost:38100")


@pytest.mark.parametrize(
    ("old_service", "method", "path_template", "body"),
    [
        (svc, m, p, b)
        for svc in ("analytics", "notification")
        for (m, p, b) in ROUTES.get(svc, [])
    ],
)
def test_route_parity(
    old_service: str,
    method: str,
    path_template: str,
    body: dict | None,
    load_recording,
    new_service_url: str,
) -> None:
    """For each route in the engagement bundle, replay the recorded
    request against alp-engagement and assert response parity.

    Skips cleanly if no recording exists yet — the harness is opt-in
    per route as recordings get captured."""
    route_key = f"{method} {path_template}"
    recording = load_recording(old_service, route_key)
    if recording is None:
        pytest.skip(f"no recording for {old_service} {route_key}")

    req = recording["request"]
    expected = recording["response"]

    with httpx.Client(base_url=new_service_url, timeout=10.0) as client:
        resp = client.request(
            req["method"],
            req["path"],
            headers={k: v for k, v in req["headers"].items() if v != "<redacted>"},
            json=req["body"],
        )

    assert resp.status_code == expected["status"], (
        f"{route_key}: status {resp.status_code} vs expected {expected['status']}"
    )
    try:
        actual_body = resp.json()
    except ValueError:
        actual_body = resp.text

    assert normalise_response(actual_body) == normalise_response(expected["body"]), (
        f"{route_key}: response body mismatch (after normalisation)"
    )


def test_notification_durable_consumers_alive(new_service_url: str) -> None:
    """Notification's parity is JetStream-side — assert the new service
    has registered the same durable consumer names. Until alp-engagement
    is wired up to subscribe in Sprint B, this test will skip via the
    NotImplementedError path. Once Sprint B lands, remove the skip."""
    pytest.skip("Sprint B: assert NATS consumer names analytics-quiz-completed, notification-quiz-completed, notification-assignment-created are bound to alp-engagement")
