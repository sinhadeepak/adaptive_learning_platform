"""Contract parity tests for alp-identity (Sprint D target).

Replays recordings captured from auth, user-profile, and institution
against the new alp-identity service.
"""

from __future__ import annotations

import os

import httpx
import pytest

from tests.consolidation.conftest import normalise_response
from tests.consolidation.inventory import ROUTES


@pytest.fixture(scope="module")
def new_service_url() -> str:
    return os.environ.get("IDENTITY_BASE_URL", "http://localhost:38102")


@pytest.mark.parametrize(
    ("old_service", "method", "path_template", "body"),
    [
        (svc, m, p, b)
        for svc in ("auth", "user_profile", "institution")
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
