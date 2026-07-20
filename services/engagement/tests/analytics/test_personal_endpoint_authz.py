"""IDOR sweep — personal /analytics/{user_id} endpoints now require either the
caller's own bearer (or platform admin) OR the shared internal-service token.

Uses /analytics/mastery/{user_id} as the representative guarded endpoint; the
same `require_owner` dependency gates all 27 personal routes.
"""

from __future__ import annotations

import base64
import json
from uuid import uuid4

import pytest

from engagement.analytics.config import settings

MASTERY = "/analytics/mastery/"


def _bearer(sub: str, role: str = "STUDENT") -> dict[str, str]:
    def _seg(o: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")

    return {"Authorization": f"Bearer {_seg({'alg': 'HS256'})}.{_seg({'sub': sub, 'role': role})}.sig"}


@pytest.mark.asyncio
async def test_no_credentials_is_401(client) -> None:
    resp = await client.get(f"{MASTERY}{uuid4()}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_owner_bearer_allowed(client) -> None:
    uid = str(uuid4())
    resp = await client.get(f"{MASTERY}{uid}", headers=_bearer(uid))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_other_users_data_is_403(client) -> None:
    resp = await client.get(f"{MASTERY}{uuid4()}", headers=_bearer(str(uuid4())))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_allowed(client) -> None:
    resp = await client.get(f"{MASTERY}{uuid4()}", headers=_bearer(str(uuid4()), role="PLATFORM_ADMIN"))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_internal_token_bypass_allows_service_call(client) -> None:
    """A peer service (no user bearer) presents the shared internal token."""
    resp = await client.get(
        f"{MASTERY}{uuid4()}",
        headers={"x-internal-token": settings.internal_service_token},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_wrong_internal_token_is_401(client) -> None:
    resp = await client.get(
        f"{MASTERY}{uuid4()}", headers={"x-internal-token": "not-the-secret"}
    )
    assert resp.status_code == 401
