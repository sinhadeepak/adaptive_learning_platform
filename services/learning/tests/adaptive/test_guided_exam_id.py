"""Test that guided-next-steps resolves exam_id → exam_code via catalog DB."""

import pytest
from learning.adaptive import routes as adaptive_routes


@pytest.mark.asyncio
async def test_exam_id_resolves_to_code(monkeypatch):
    captured = {}

    async def fake_build(*, user_id, exam_code=None):
        captured["exam_code"] = exam_code
        return {"headline": "x", "steps": [], "source": "heuristic"}

    async def fake_resolve_code(exam_id):
        return "NEET" if exam_id == "exam-neet" else None

    monkeypatch.setattr(adaptive_routes, "build_guided_next_steps", fake_build)
    monkeypatch.setattr(adaptive_routes, "_exam_code_for_id", fake_resolve_code)

    await adaptive_routes.get_guided_next_steps("u1", exam=None, exam_id="exam-neet")
    assert captured["exam_code"] == "NEET"


@pytest.mark.asyncio
async def test_exam_id_falls_back_to_exam_when_not_found(monkeypatch):
    """When exam_id resolves to None, fall through to ?exam param."""
    captured = {}

    async def fake_build(*, user_id, exam_code=None):
        captured["exam_code"] = exam_code
        return {"headline": "x", "steps": [], "source": "heuristic"}

    async def fake_resolve_code(exam_id):
        return None  # unknown id

    monkeypatch.setattr(adaptive_routes, "build_guided_next_steps", fake_build)
    monkeypatch.setattr(adaptive_routes, "_exam_code_for_id", fake_resolve_code)

    await adaptive_routes.get_guided_next_steps("u1", exam="JEE", exam_id="unknown-id")
    assert captured["exam_code"] == "JEE"


@pytest.mark.asyncio
async def test_exam_id_takes_precedence_over_exam(monkeypatch):
    """When both exam and exam_id given, exam_id wins if it resolves."""
    captured = {}

    async def fake_build(*, user_id, exam_code=None):
        captured["exam_code"] = exam_code
        return {"headline": "x", "steps": [], "source": "heuristic"}

    async def fake_resolve_code(exam_id):
        return "NEET"

    monkeypatch.setattr(adaptive_routes, "build_guided_next_steps", fake_build)
    monkeypatch.setattr(adaptive_routes, "_exam_code_for_id", fake_resolve_code)

    await adaptive_routes.get_guided_next_steps("u1", exam="JEE", exam_id="exam-neet")
    assert captured["exam_code"] == "NEET"
