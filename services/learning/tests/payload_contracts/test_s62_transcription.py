"""Phase 5 (P5-S62) — Whisper transcription pipeline.

Provider abstraction + stub round-trip + route-level happy paths +
error surfaces. The OpenAIWhisperProvider's actual API call is not
exercised — that requires a live OpenAI key + network — but the
provider's import + construction is verified.
"""

from __future__ import annotations

import asyncio
import hashlib
import io

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from learning.transcription.provider import (
    DEFAULT_MODEL,
    MAX_AUDIO_BYTES,
    StubTranscriptionProvider,
    TranscriptionResult,
    _ext_from_content_type,
    get_provider,
    reset_for_tests,
    set_provider,
)
from learning.transcription.routes import router as transcription_router


def _run(coro):
    return asyncio.run(coro)


# ── Provider stub ──────────────────────────────────────────────────────────


def test_stub_provider_returns_default_transcript() -> None:
    p = StubTranscriptionProvider()
    out = _run(p.transcribe(audio_bytes=b"clean audio", content_type="audio/mp3"))
    assert "[stub transcript" in out.text
    assert out.language == "en"
    assert out.model == "stub-v1"


def test_stub_provider_canned_response_by_hash() -> None:
    p = StubTranscriptionProvider()
    blob = b"medical training video"
    digest = hashlib.sha256(blob).hexdigest()
    p.register_canned(
        digest[:16],
        TranscriptionResult(
            text="The surgeon makes the initial incision...",
            language="en",
            duration_seconds=72.0,
            model="whisper-1",
        ),
    )
    out = _run(p.transcribe(audio_bytes=blob, content_type="video/mp4"))
    assert "incision" in out.text
    assert out.duration_seconds == 72.0


def test_stub_provider_respects_language_override() -> None:
    p = StubTranscriptionProvider()
    out = _run(p.transcribe(
        audio_bytes=b"x",
        content_type="audio/mp3",
        language="hi",
    ))
    assert out.language == "hi"


# ── Module-level singleton ─────────────────────────────────────────────────


def test_set_provider_round_trip() -> None:
    reset_for_tests()
    assert get_provider() is None
    p = StubTranscriptionProvider()
    set_provider(p)
    assert get_provider() is p
    reset_for_tests()
    assert get_provider() is None


# ── _ext_from_content_type ─────────────────────────────────────────────────


def test_ext_known_types() -> None:
    assert _ext_from_content_type("audio/mp3") == "mp3"
    assert _ext_from_content_type("audio/wav") == "wav"
    assert _ext_from_content_type("video/mp4") == "mp4"


def test_ext_unknown_falls_back_to_mp3() -> None:
    assert _ext_from_content_type("application/octet-stream") == "mp3"


# ── Route ──────────────────────────────────────────────────────────────────


def _app(provider) -> FastAPI:
    app = FastAPI()
    app.include_router(transcription_router)
    set_provider(provider)
    return app


def test_route_503_when_no_provider() -> None:
    reset_for_tests()
    app = FastAPI()
    app.include_router(transcription_router)
    client = TestClient(app)
    resp = client.post(
        "/content/ai/transcribe",
        files={"audio": ("a.mp3", b"x", "audio/mp3")},
    )
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "transcription_unavailable"


def test_route_400_on_bad_content_type() -> None:
    reset_for_tests()
    p = StubTranscriptionProvider()
    client = TestClient(_app(p))
    resp = client.post(
        "/content/ai/transcribe",
        files={"audio": ("a.txt", b"x", "text/plain")},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "bad_content_type"
    reset_for_tests()


def test_route_413_on_oversize() -> None:
    reset_for_tests()
    p = StubTranscriptionProvider()
    client = TestClient(_app(p))
    big = b"x" * (MAX_AUDIO_BYTES + 1)
    resp = client.post(
        "/content/ai/transcribe",
        files={"audio": ("a.mp3", big, "audio/mp3")},
    )
    assert resp.status_code == 413
    assert resp.json()["detail"]["code"] == "payload_too_large"
    reset_for_tests()


def test_route_happy_path_with_stub() -> None:
    reset_for_tests()
    p = StubTranscriptionProvider()
    blob = b"hello whisper"
    digest = hashlib.sha256(blob).hexdigest()
    p.register_canned(
        digest[:16],
        TranscriptionResult(
            text="Hello Whisper.",
            language="en",
            duration_seconds=2.5,
            model="whisper-1",
        ),
    )
    client = TestClient(_app(p))
    resp = client.post(
        "/content/ai/transcribe",
        files={"audio": ("a.mp3", blob, "audio/mp3")},
        data={"language": "en"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["text"] == "Hello Whisper."
    assert body["language"] == "en"
    assert body["duration_seconds"] == 2.5
    assert body["model"] == "whisper-1"
    reset_for_tests()


def test_route_502_on_provider_failure() -> None:
    reset_for_tests()

    class _FailingProvider:
        name = "fail"

        async def transcribe(self, **kw):
            raise RuntimeError("openai down")

    client = TestClient(_app(_FailingProvider()))
    resp = client.post(
        "/content/ai/transcribe",
        files={"audio": ("a.mp3", b"x", "audio/mp3")},
    )
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "transcription_provider_error"
    reset_for_tests()


def test_route_400_when_provider_raises_value_error() -> None:
    reset_for_tests()

    class _ValueErrorProvider:
        name = "ve"

        async def transcribe(self, **kw):
            raise ValueError("bad audio bytes")

    client = TestClient(_app(_ValueErrorProvider()))
    resp = client.post(
        "/content/ai/transcribe",
        files={"audio": ("a.mp3", b"x", "audio/mp3")},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "bad_audio"
    reset_for_tests()


# ── OpenAI provider construction ───────────────────────────────────────────


def test_openai_provider_raises_without_api_key(monkeypatch) -> None:
    """Constructor surfaces missing-key as a clean RuntimeError so
    the lifespan hook can fall back to the stub."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from learning.transcription.provider import OpenAIWhisperProvider

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        OpenAIWhisperProvider()


def test_default_model_constant() -> None:
    assert DEFAULT_MODEL == "whisper-1"
