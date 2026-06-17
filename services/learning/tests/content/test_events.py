"""Sanity tests for the Content JetStream publisher.

These don't require a running NATS — they verify the publisher gracefully
no-ops when JS isn't connected, and that publish_question_published builds the
right payload shape (validated by tapping into the module-level _js).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import pytest

from learning.content import events


@pytest.mark.asyncio
async def test_publish_when_disconnected_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(events, "_js", None)
    # Should swallow silently, never raise.
    await events.publish_question_published(
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "topic_id": "22222222-2222-2222-2222-222222222222",
            "stem": "test",
            "choices": ["a", "b"],
            "correct_idx": 0,
            "difficulty_b": 0.0,
            "language": "en",
            "reviewed_by": "33333333-3333-3333-3333-333333333333",
            "reviewed_at": datetime(2026, 4, 25, tzinfo=UTC),
        }
    )


class _FakeJS:
    """Records publishes so the test can assert on the wire payload shape."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def publish(self, subject: str, data: bytes) -> None:
        self.calls.append((subject, json.loads(data.decode("utf-8"))))


@pytest.mark.asyncio
async def test_publish_payload_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeJS()
    monkeypatch.setattr(events, "_js", fake)
    await events.publish_question_published(
        {
            "id": "aaa",
            "topic_id": "bbb",
            "stem": "What is 2+2?",
            "choices": ["3", "4"],
            "correct_idx": 1,
            "difficulty_b": 0.7,
            "language": "hi",
            "reviewed_by": "ccc",
            "reviewed_at": datetime(2026, 4, 25, 12, 0, tzinfo=UTC),
        }
    )
    assert len(fake.calls) == 1
    subject, payload = fake.calls[0]
    assert subject == events.SUBJECT_QUESTION_PUBLISHED
    assert payload["id"] == "aaa"
    assert payload["topic_id"] == "bbb"
    assert payload["choices"] == ["3", "4"]
    assert payload["correct_idx"] == 1
    assert payload["difficulty_b"] == 0.7
    assert payload["language"] == "hi"
    assert payload["reviewed_at"] == "2026-04-25T12:00:00+00:00"
    # MCQ row with no typed payload omits the key (choices suffice).
    assert "payload" not in payload


@pytest.mark.asyncio
async def test_publish_carries_typed_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Non-MCQ questions must ship their renderer payload on the wire so
    Quiz can mirror it into quiz_schema (the #3 fix)."""
    fake = _FakeJS()
    monkeypatch.setattr(events, "_js", fake)
    typed = {
        "list_a": [{"id": "1", "text": "H2O"}],
        "list_b": [{"id": "a", "text": "Water"}],
        "correct_pairs": [{"left_id": "1", "right_id": "a"}],
    }
    await events.publish_question_published(
        {
            "id": "aaa",
            "topic_id": "bbb",
            "stem": "Match the following",
            "choices": [],
            "correct_idx": 0,
            "difficulty_b": 0.5,
            "language": "en",
            "reviewed_by": "ccc",
            "reviewed_at": datetime(2026, 4, 25, 12, 0, tzinfo=UTC),
            "question_type": "MATCH_THE_FOLLOWING",
            "payload": typed,
        }
    )
    _, payload = fake.calls[0]
    assert payload["question_type"] == "MATCH_THE_FOLLOWING"
    # Carried verbatim as a JSON object (not a re-encoded string).
    assert payload["payload"] == typed


@pytest.mark.asyncio
async def test_publish_swallows_publisher_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FlakyJS:
        async def publish(self, *_: object, **__: object) -> None:
            raise RuntimeError("nats fell over")

    monkeypatch.setattr(events, "_js", _FlakyJS())
    # Best-effort contract: a publish failure must never propagate.
    await events.publish_question_published(
        {
            "id": "x",
            "topic_id": "y",
            "stem": "z",
            "choices": ["a", "b"],
            "correct_idx": 0,
            "difficulty_b": 0.0,
            "language": "en",
            "reviewed_by": "w",
            "reviewed_at": None,
        }
    )
