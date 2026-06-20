import pytest

from engagement.analytics import exam_scope


@pytest.mark.asyncio
async def test_resolve_caches_within_ttl(monkeypatch):
    exam_scope._reset_cache()
    calls = {"n": 0}

    async def fake_fetch(exam_id: str) -> set[str]:
        calls["n"] += 1
        return {"t1", "t2"}

    monkeypatch.setattr(exam_scope, "_fetch_exam_topic_ids", fake_fetch)
    # Two calls at the same clock → one underlying fetch (cache hit).
    a = await exam_scope.resolve_exam_topic_ids("exam-1", clock=100.0)
    b = await exam_scope.resolve_exam_topic_ids("exam-1", clock=100.0)
    assert a == {"t1", "t2"} and b == {"t1", "t2"}
    assert calls["n"] == 1
    # After TTL expiry → re-fetch.
    await exam_scope.resolve_exam_topic_ids("exam-1", clock=100.0 + exam_scope._CACHE_TTL + 1)
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_fetch_returns_empty_on_http_error(monkeypatch):
    exam_scope._reset_cache()
    import httpx

    class _Boom:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): raise httpx.HTTPError("down")

    monkeypatch.setattr(exam_scope.httpx, "AsyncClient", _Boom)
    out = await exam_scope._fetch_exam_topic_ids("exam-x")
    assert out == set()
