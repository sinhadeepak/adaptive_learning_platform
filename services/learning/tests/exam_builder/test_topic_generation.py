"""generate_topics_for_subject — the reusable single-subject topic call."""
from __future__ import annotations

import asyncio

import pytest

from learning.exam_builder import routes as eb
from learning.exam_builder.routes import ExistingTopic, ResearchError, generate_topics_for_subject


def _mock_topics(payload):
    async def _fake(_session, *, system, user, schema_name, schema):
        assert schema_name == "subject_topics"
        return payload
    return _fake


def test_generate_topics_returns_drafts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        eb, "call_structured",
        _mock_topics({"topics": [
            {"code": "T1", "title": "One", "description": None},
            {"code": "T2", "title": "Two", "description": None},
        ]}),
    )
    out = asyncio.run(generate_topics_for_subject(
        exam_name="Test", exam_code="TEST", level="other",
        subject_code="SUB_A", subject_name="Subject A", existing_topics=[],
    ))
    assert [t.code for t in out] == ["T1", "T2"]


def test_generate_topics_seeds_existing_codes(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}
    async def _fake(_session, *, system, user, schema_name, schema):
        seen["user"] = user
        return {"topics": [{"code": "T1", "title": "One", "description": None}]}
    monkeypatch.setattr(eb, "call_structured", _fake)
    asyncio.run(generate_topics_for_subject(
        exam_name="Test", exam_code="TEST", level="other",
        subject_code="SUB_A", subject_name="Subject A",
        existing_topics=[ExistingTopic(code="OLD", title="Old Topic")],
    ))
    assert "already has these topics" in seen["user"]
    assert "OLD" in seen["user"]


def test_generate_topics_raises_on_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(eb, "call_structured", _mock_topics(None))
    with pytest.raises(ResearchError):
        asyncio.run(generate_topics_for_subject(
            exam_name="Test", exam_code="TEST", level="other",
            subject_code="SUB_A", subject_name="Subject A", existing_topics=[],
        ))
