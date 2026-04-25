"""Integration tests for /search/* against the running OpenSearch container."""

from __future__ import annotations

import os
import secrets
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from search.config import settings
from search.index import bulk_index_topics, drop_index, ensure_index
from search.main import app

os.environ.setdefault("SEARCH_OPENSEARCH_URL", "http://localhost:39200")

pytestmark = pytest.mark.asyncio


def _admin_token() -> str:
    now = datetime.now(tz=UTC)
    return jwt.encode(
        {
            "sub": "00000000-0000-0000-0000-0000000000ad",
            "role": "PLATFORM_ADMIN",
            "admin_access_level": "PLATFORM",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=15)).timestamp()),
            "jti": secrets.token_urlsafe(12),
            "token_type": "access",
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


SEED_DOCS = [
    {
        "id": "33333333-0000-0000-0000-000000000001",
        "type": "topic",
        "title": "Mechanics",
        "title_hi": "यांत्रिकी",
        "subtitle": "Physics · JEE Main",
        "description": "Motion, forces, and energy. (yantriki)",
        "subject_name": "Physics",
        "exam_code": "JEE_MAIN",
        "tier": "FREE",
        "title_suggest": {"input": ["Mechanics", "Physics", "यांत्रिकी"], "weight": 48},
    },
    {
        "id": "33333333-0000-0000-0000-000000000003",
        "type": "topic",
        "title": "Electrostatics",
        "title_hi": "स्थिरवैद्युतिकी",
        "subtitle": "Physics · JEE Main",
        "description": "Charges, fields, and potentials. (sthir vidyutiki)",
        "subject_name": "Physics",
        "exam_code": "JEE_MAIN",
        "tier": "FREE",
        "title_suggest": {"input": ["Electrostatics", "Physics", "स्थिरवैद्युतिकी"], "weight": 40},
    },
    {
        "id": "33333333-0000-0000-0000-000000000006",
        "type": "topic",
        "title": "Calculus",
        "title_hi": "कलन",
        "subtitle": "Mathematics · JEE Main",
        "description": "Limits, derivatives, and integrals. (kalan)",
        "subject_name": "Mathematics",
        "exam_code": "JEE_MAIN",
        "tier": "FREE",
        "title_suggest": {"input": ["Calculus", "Mathematics", "कलन"], "weight": 52},
    },
]


@pytest_asyncio.fixture
async def fresh_index() -> AsyncIterator[None]:
    await drop_index()
    await ensure_index()
    await bulk_index_topics(SEED_DOCS)
    yield
    # Leave the index in place so other tests can iterate fast; reset is per-test.


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_search_finds_topic_by_exact_title(client: AsyncClient, fresh_index: None) -> None:
    r = await client.get("/search?q=Mechanics")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    titles = [hit["title"] for hit in body["results"]]
    assert "Mechanics" in titles


async def test_search_fuzzy_match(client: AsyncClient, fresh_index: None) -> None:
    # AUTO fuzziness should catch a 1-char typo on Calculus.
    r = await client.get("/search?q=Calclus")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert any(h["title"] == "Calculus" for h in body["results"])


async def test_search_no_results(client: AsyncClient, fresh_index: None) -> None:
    r = await client.get("/search?q=quantummechanicsadvanced")
    assert r.status_code == 200
    assert r.json()["total"] == 0


async def test_search_pagination_and_perPage(client: AsyncClient, fresh_index: None) -> None:
    r = await client.get("/search?q=Physics&perPage=1&page=1")
    assert r.status_code == 200
    body = r.json()
    assert body["page"] == 1
    assert body["perPage"] == 1
    assert len(body["results"]) <= 1


async def test_typeahead_completes_prefix(client: AsyncClient, fresh_index: None) -> None:
    r = await client.get("/search/typeahead?q=Mech")
    assert r.status_code == 200
    suggestions = r.json()
    assert any(s["title"] == "Mechanics" for s in suggestions)


async def test_typeahead_empty_for_unmatched(client: AsyncClient, fresh_index: None) -> None:
    r = await client.get("/search/typeahead?q=zzz")
    assert r.status_code == 200
    assert r.json() == []


async def test_admin_reindex_requires_admin(client: AsyncClient, fresh_index: None) -> None:
    r = await client.post("/admin/reindex")
    assert r.status_code in {401, 403}


async def test_search_query_required(client: AsyncClient, fresh_index: None) -> None:
    r = await client.get("/search")  # missing q
    assert r.status_code == 422


# ---- Bilingual search (SPIKE-02 / GAP-04 closure) ---------------------------


async def test_search_hindi_devanagari_finds_topic(client: AsyncClient, fresh_index: None) -> None:
    """Pure Devanagari query hits the title_hi field via alp_hindi analyzer."""
    r = await client.get("/search?q=यांत्रिकी")
    assert r.status_code == 200
    body = r.json()
    titles = [hit["title"] for hit in body["results"]]
    assert "Mechanics" in titles


async def test_search_hindi_stemmed_partial(client: AsyncClient, fresh_index: None) -> None:
    """Hindi stemmer normalizes the inflected form; should still hit Mechanics."""
    r = await client.get("/search?q=यांत्रिक")
    assert r.status_code == 200
    body = r.json()
    titles = [hit["title"] for hit in body["results"]]
    assert "Mechanics" in titles


async def test_search_hinglish_alias_via_description(
    client: AsyncClient, fresh_index: None
) -> None:
    """Latin-script Hindi term ('yantriki') appears in description; hits via
    English analyzer's standard tokenizer."""
    r = await client.get("/search?q=yantriki")
    assert r.status_code == 200
    body = r.json()
    titles = [hit["title"] for hit in body["results"]]
    assert "Mechanics" in titles


async def test_search_english_still_works_post_bilingual(
    client: AsyncClient, fresh_index: None
) -> None:
    """Adding alp_hindi must not regress English queries."""
    r = await client.get("/search?q=Calculus")
    assert r.status_code == 200
    body = r.json()
    titles = [hit["title"] for hit in body["results"]]
    assert "Calculus" in titles


async def test_typeahead_supports_devanagari(client: AsyncClient, fresh_index: None) -> None:
    """Completion suggester accepts Devanagari prefix because we registered
    Hindi titles in the suggest input list."""
    r = await client.get("/search/typeahead?q=यांत्र")
    assert r.status_code == 200
    suggestions = r.json()
    # Suggester returns the matched input; should surface the Mechanics row.
    assert any("यांत्रिकी" in s["title"] or s["title"] == "Mechanics" for s in suggestions)
