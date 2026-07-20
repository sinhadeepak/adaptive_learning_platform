"""Route test for GET /analytics/multi-exam-summary/{user_id}."""
from __future__ import annotations

import base64
import json
from uuid import uuid4

import pytest


def _bearer(sub: str, role: str = "STUDENT") -> dict[str, str]:
    def _seg(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
    tok = f"{_seg({'alg':'HS256'})}.{_seg({'sub': sub, 'role': role})}.sig"
    return {"Authorization": f"Bearer {tok}"}


@pytest.mark.asyncio
async def test_owner_guard_blocks_other_user(client) -> None:
    victim, attacker = str(uuid4()), str(uuid4())
    r = await client.get(
        f"/analytics/multi-exam-summary/{victim}?examIds=e1",
        headers=_bearer(attacker),
    )
    assert r.status_code == 403
    anon = await client.get(f"/analytics/multi-exam-summary/{victim}?examIds=e1")
    assert anon.status_code == 401


@pytest.mark.asyncio
async def test_returns_one_entry_per_exam(client, monkeypatch) -> None:
    uid = str(uuid4())
    # Stub the catalog resolver so no learning service is needed: e1 -> {t1}, e2 -> empty.
    # NOTE: topic_id columns are `uuid` in Postgres, so the fake topic id must be a
    # syntactically valid UUID (the brief's literal "t1" placeholder fails the
    # CAST(... AS uuid[]) in list_user_mastery/count_due against the real DB).
    from engagement.analytics import routes as routes_mod

    t1 = str(uuid4())

    async def _fake_resolve(exam_id, *, clock=None):
        return {t1} if exam_id == "e1" else set()

    monkeypatch.setattr(routes_mod, "resolve_exam_topic_ids", _fake_resolve)

    r = await client.get(
        f"/analytics/multi-exam-summary/{uid}?examIds=e1,e2",
        headers=_bearer(uid),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["userId"] == uid
    assert [e["examId"] for e in body["exams"]] == ["e1", "e2"]
    # Fresh user: zeroed but well-formed.
    e2 = next(e for e in body["exams"] if e["examId"] == "e2")
    assert e2["readinessScore"] == 0.0 and e2["nTopics"] == 0
    assert e2["mistakesDue"] == 0 and e2["revisionDue"] == 0
    assert e2["weakestTopicId"] is None
