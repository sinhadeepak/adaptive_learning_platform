"""Sprint 11 S11-A — cohort invite flow tests.

Covers:
- Pure-helper signed token (generate + verify, including tamper detection)
- POST /cohorts/{id}/invites mints a working token
- POST /cohorts/invites/{token}/claim adds the user, bumps uses
- 410 paths: invalid signature, unknown token, exhausted, expired
- Idempotent re-claim by the same user (cohort_members add is no-op)
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from institution.config import settings
from institution.invite_token import generate_invite_token, verify_invite_token
from institution.main import app

os.environ.setdefault(
    "INSTITUTION_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/institution",
)
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/institution",
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def truncated() -> AsyncIterator[None]:
    engine = create_async_engine(os.environ["DATABASE_URL"])
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "TRUNCATE institution_schema.cohort_invites, "
                    "institution_schema.cohort_members, "
                    "institution_schema.cohorts, "
                    "institution_schema.tenants RESTART IDENTITY CASCADE"
                )
            )
        yield
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def client(truncated: None) -> AsyncIterator[AsyncClient]:  # noqa: ARG001
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ─────────────────────────────────────────────────────────────────────────
# Pure helpers
# ─────────────────────────────────────────────────────────────────────────


def test_token_round_trip() -> None:
    secret = "test-secret-32-bytes-or-more-pls"
    tok = generate_invite_token(secret)
    assert verify_invite_token(tok, secret) is True


def test_token_rejects_tamper() -> None:
    secret = "test-secret-32-bytes-or-more-pls"
    tok = generate_invite_token(secret)
    # Flip one byte of the random head — HMAC should no longer match.
    head, _, tail = tok.partition(".")
    bad = "X" + head[1:] + "." + tail
    assert verify_invite_token(bad, secret) is False


def test_token_rejects_wrong_secret() -> None:
    tok = generate_invite_token("secret-A-32-bytes-or-more-please-x")
    assert verify_invite_token(tok, "secret-B-32-bytes-or-more-please-x") is False


def test_token_rejects_malformed() -> None:
    secret = "any-secret-32-bytes-or-more-please"
    assert verify_invite_token("", secret) is False
    assert verify_invite_token("no-dot", secret) is False
    assert verify_invite_token(".", secret) is False


# ─────────────────────────────────────────────────────────────────────────
# Endpoint flow
# ─────────────────────────────────────────────────────────────────────────


async def _make_cohort(client: AsyncClient) -> tuple[str, str]:
    tenant = (
        await client.post(
            "/institution/tenants",
            json={"name": "T " + uuid.uuid4().hex[:6], "kind": "SCHOOL"},
        )
    ).json()
    cohort = (
        await client.post(
            f"/institution/tenants/{tenant['id']}/cohorts",
            json={"name": "Class XI"},
        )
    ).json()
    return tenant["id"], cohort["id"]


async def test_post_invite_404s_for_unknown_cohort(client: AsyncClient) -> None:
    r = await client.post(
        f"/institution/cohorts/{uuid.uuid4()}/invites", json={}
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "cohort_not_found"


async def test_post_invite_returns_signed_token(client: AsyncClient) -> None:
    _, cohort_id = await _make_cohort(client)
    r = await client.post(
        f"/institution/cohorts/{cohort_id}/invites", json={"maxUses": 5}
    )
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    assert "." in token
    assert verify_invite_token(token, settings.jwt_secret) is True


async def test_claim_adds_user_to_cohort(client: AsyncClient) -> None:
    _, cohort_id = await _make_cohort(client)
    invite = (
        await client.post(
            f"/institution/cohorts/{cohort_id}/invites", json={"maxUses": 5}
        )
    ).json()
    user_id = str(uuid.uuid4())
    r = await client.post(
        f"/institution/cohorts/invites/{invite['token']}/claim",
        json={"userId": user_id},
    )
    assert r.status_code == 200, r.text
    assert r.json()["cohortId"] == cohort_id

    # Confirm membership row landed.
    members = (
        await client.get(f"/institution/cohorts/{cohort_id}/members")
    ).json()
    assert any(m["userId"] == user_id for m in members)


async def test_claim_410s_on_invalid_signature(client: AsyncClient) -> None:
    _, cohort_id = await _make_cohort(client)
    invite = (
        await client.post(
            f"/institution/cohorts/{cohort_id}/invites", json={}
        )
    ).json()
    token = invite["token"]
    # Tamper the signature.
    head, _, tail = token.partition(".")
    bad = head + ".AAAA"
    r = await client.post(
        f"/institution/cohorts/invites/{bad}/claim",
        json={"userId": str(uuid.uuid4())},
    )
    assert r.status_code == 410


async def test_claim_410s_on_unknown_token(client: AsyncClient) -> None:
    """A signed-but-not-stored token. Possible if the row was deleted
    (revocation)."""
    fake = generate_invite_token(settings.jwt_secret)
    r = await client.post(
        f"/institution/cohorts/invites/{fake}/claim",
        json={"userId": str(uuid.uuid4())},
    )
    assert r.status_code == 410


async def test_claim_respects_max_uses(client: AsyncClient) -> None:
    _, cohort_id = await _make_cohort(client)
    invite = (
        await client.post(
            f"/institution/cohorts/{cohort_id}/invites", json={"maxUses": 2}
        )
    ).json()
    # Two claims succeed.
    for _ in range(2):
        r = await client.post(
            f"/institution/cohorts/invites/{invite['token']}/claim",
            json={"userId": str(uuid.uuid4())},
        )
        assert r.status_code == 200
    # Third claim hits the cap.
    r = await client.post(
        f"/institution/cohorts/invites/{invite['token']}/claim",
        json={"userId": str(uuid.uuid4())},
    )
    assert r.status_code == 410
    assert r.json()["detail"]["code"] == "invite_exhausted"


async def test_list_invites_redacts_tokens(client: AsyncClient) -> None:
    """Sprint 12 S12-A — the educator UI lists invites. The token here
    must be redacted: never expose the HMAC tail (which is the only
    forgery barrier between a leaked list and a working claim)."""
    _, cohort_id = await _make_cohort(client)
    await client.post(
        f"/institution/cohorts/{cohort_id}/invites", json={"maxUses": 5}
    )
    r = await client.get(f"/institution/cohorts/{cohort_id}/invites")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    preview = items[0]["tokenPreview"]
    # Preview shape: `…<4-chars>.***` — never includes the real signature.
    assert preview.endswith(".***")
    assert preview.startswith("…")


async def test_delete_invite_removes_then_claim_410s(client: AsyncClient) -> None:
    """Sprint 12 S12-A — once revoked, the same token can't be claimed."""
    _, cohort_id = await _make_cohort(client)
    invite = (
        await client.post(
            f"/institution/cohorts/{cohort_id}/invites", json={}
        )
    ).json()
    r = await client.delete(f"/institution/cohorts/invites/{invite['id']}")
    assert r.status_code == 204
    # Re-claim must 410.
    r2 = await client.post(
        f"/institution/cohorts/invites/{invite['token']}/claim",
        json={"userId": str(uuid.uuid4())},
    )
    assert r2.status_code == 410


async def test_delete_invite_404s_when_unknown(client: AsyncClient) -> None:
    r = await client.delete(f"/institution/cohorts/invites/{uuid.uuid4()}")
    assert r.status_code == 404


def test_redact_invite_token_pure_helper() -> None:
    from institution.core_repo import redact_invite_token

    assert redact_invite_token("abcd1234.signaturepart") == "…1234.***"
    # Less than 4 chars in head still works.
    assert redact_invite_token("xy.sig") == "…xy.***"
    # Malformed input shouldn't leak any random bytes.
    assert redact_invite_token("nodot") == "***"
    assert redact_invite_token("") == "***"


async def test_claim_appends_audit_row(client: AsyncClient) -> None:
    """Sprint 13 S13-B — every successful claim produces an audit row
    that the educator UI can list."""
    _, cohort_id = await _make_cohort(client)
    invite = (
        await client.post(
            f"/institution/cohorts/{cohort_id}/invites", json={}
        )
    ).json()
    user_id = str(uuid.uuid4())
    r = await client.post(
        f"/institution/cohorts/invites/{invite['token']}/claim",
        json={"userId": user_id},
    )
    assert r.status_code == 200
    claims = (
        await client.get(f"/institution/cohorts/invites/{invite['id']}/claims")
    ).json()
    assert len(claims) == 1
    assert claims[0]["userId"] == user_id


async def test_repeated_claims_show_in_audit_funnel(client: AsyncClient) -> None:
    """Same student opening the link twice WILL produce two audit rows.
    cohort_members PK still de-dupes to one membership; the audit
    captures the funnel signal."""
    _, cohort_id = await _make_cohort(client)
    invite = (
        await client.post(
            f"/institution/cohorts/{cohort_id}/invites", json={}
        )
    ).json()
    user_id = str(uuid.uuid4())
    for _ in range(2):
        await client.post(
            f"/institution/cohorts/invites/{invite['token']}/claim",
            json={"userId": user_id},
        )
    claims = (
        await client.get(f"/institution/cohorts/invites/{invite['id']}/claims")
    ).json()
    assert len(claims) == 2


async def test_unknown_invite_id_returns_empty_list(client: AsyncClient) -> None:
    """By-design: revoked / never-existed invites produce empty results
    rather than 404."""
    r = await client.get(
        f"/institution/cohorts/invites/{uuid.uuid4()}/claims"
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_revoking_invite_clears_audit(client: AsyncClient) -> None:
    """FK CASCADE removes audit rows when the invite is revoked. That's
    the explicit design (see migration docstring)."""
    _, cohort_id = await _make_cohort(client)
    invite = (
        await client.post(
            f"/institution/cohorts/{cohort_id}/invites", json={}
        )
    ).json()
    user_id = str(uuid.uuid4())
    await client.post(
        f"/institution/cohorts/invites/{invite['token']}/claim",
        json={"userId": user_id},
    )
    await client.delete(f"/institution/cohorts/invites/{invite['id']}")
    claims = (
        await client.get(f"/institution/cohorts/invites/{invite['id']}/claims")
    ).json()
    assert claims == []


async def test_same_user_can_claim_twice_idempotently(client: AsyncClient) -> None:
    """If the student opens the invite link twice (refresh, deep-link
    racing), they shouldn't see an error. The cohort_members add is
    ON CONFLICT DO NOTHING; the only visible effect is a wasted
    `uses` slot — that's acceptable for now."""
    _, cohort_id = await _make_cohort(client)
    invite = (
        await client.post(
            f"/institution/cohorts/{cohort_id}/invites", json={}
        )
    ).json()
    user_id = str(uuid.uuid4())
    r1 = await client.post(
        f"/institution/cohorts/invites/{invite['token']}/claim",
        json={"userId": user_id},
    )
    r2 = await client.post(
        f"/institution/cohorts/invites/{invite['token']}/claim",
        json={"userId": user_id},
    )
    assert r1.status_code == 200
    assert r2.status_code == 200
    members = (
        await client.get(f"/institution/cohorts/{cohort_id}/members")
    ).json()
    # Still one row, not two — the (cohort_id, user_id) PK enforces.
    assert sum(1 for m in members if m["userId"] == user_id) == 1
