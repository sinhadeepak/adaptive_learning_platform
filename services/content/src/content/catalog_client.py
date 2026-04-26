"""HTTP client for the catalog service — used to authorize
question-creation against an educator's exam/subject scope.

Single-purpose for now: one method, no retry, fail-closed. If catalog
is unreachable or returns 5xx we return a 503 to the caller rather
than letting an unscoped write through. That matches the security
intent — better to drop a draft than to silently let it bypass.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx
from fastapi import HTTPException, status

from content.config import settings


@dataclass(frozen=True)
class AuthorizeResult:
    """One of three outcomes — see authorize_topic for the mapping."""

    allowed: bool
    not_found: bool


async def authorize_topic(*, bearer_token: str, topic_id: str) -> AuthorizeResult:
    """Call catalog's authorize endpoint with the inbound JWT.

    Returns:
      AuthorizeResult(allowed=True,  not_found=False) on 204
      AuthorizeResult(allowed=False, not_found=False) on 403
      AuthorizeResult(allowed=False, not_found=True)  on 404

    Any other status (network failure, 5xx, 401) is fail-closed —
    raises 503 to the original caller.
    """
    url = (
        f"{settings.catalog_base_url}"
        f"/catalog/educators/me/topics/{topic_id}/authorize"
    )
    try:
        async with httpx.AsyncClient(
            timeout=settings.catalog_authorize_timeout_seconds
        ) as client:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {bearer_token}"},
            )
    except httpx.HTTPError as err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "catalog_unreachable",
                "message": "Could not verify topic authorization. Try again.",
            },
        ) from err

    if resp.status_code == 204:
        return AuthorizeResult(allowed=True, not_found=False)
    if resp.status_code == 403:
        return AuthorizeResult(allowed=False, not_found=False)
    if resp.status_code == 404:
        return AuthorizeResult(allowed=False, not_found=True)

    # 401 here means the token didn't verify on catalog's side, which
    # implies a JWT_SECRET mismatch between auth and catalog. Surface
    # it as a 503 — the user can't do anything, ops needs to know.
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "catalog_unexpected_status",
            "message": f"Catalog authorize returned unexpected status {resp.status_code}.",
        },
    )
