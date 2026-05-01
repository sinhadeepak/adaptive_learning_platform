"""Transcription provider abstraction (P5-S62).

Provider-agnostic so tests can swap a stub for the OpenAI Whisper
client without rebuilding the whole pipeline. Production wires
OpenAIWhisperProvider via the lifespan hook in main.py.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

log = logging.getLogger(__name__)

# Defaults match the OpenAI Whisper API contract (whisper-1 model).
DEFAULT_MODEL = "whisper-1"
MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB Whisper API limit


@dataclass
class TranscriptionResult:
    """Result of one transcription call."""

    text: str
    language: str        # ISO 639-1; "en", "hi", etc.
    duration_seconds: float | None = None
    model: str = DEFAULT_MODEL


class TranscriptionProvider(Protocol):
    """Async transcription contract. Implementations call the underlying
    provider; the route layer handles upload + audit logging."""

    name: str

    async def transcribe(
        self,
        *,
        audio_bytes: bytes,
        content_type: str,
        prompt: str | None = None,
        language: str | None = None,
    ) -> TranscriptionResult:
        ...


class StubTranscriptionProvider:
    """No-op provider for tests + dev without API keys.

    Returns a deterministic transcript so the rest of the pipeline can
    be exercised end-to-end. Tests can register canned responses by
    content-hash prefix (matches the StubImageModerator pattern from
    image_moderation.py).
    """

    name = "stub"

    def __init__(self) -> None:
        self._canned: dict[str, TranscriptionResult] = {}

    def register_canned(
        self, hash_prefix: str, result: TranscriptionResult,
    ) -> None:
        self._canned[hash_prefix] = result

    async def transcribe(
        self,
        *,
        audio_bytes: bytes,
        content_type: str,
        prompt: str | None = None,
        language: str | None = None,
    ) -> TranscriptionResult:
        import hashlib
        digest = hashlib.sha256(audio_bytes).hexdigest()
        for prefix, canned in self._canned.items():
            if digest.startswith(prefix):
                return canned
        # Default: a short stub transcript. Caller's audit log captures
        # the stub provider so this doesn't surface as a real
        # transcript in production.
        return TranscriptionResult(
            text=f"[stub transcript {digest[:8]}]",
            language=language or "en",
            duration_seconds=0.0,
            model="stub-v1",
        )


class OpenAIWhisperProvider:
    """Real OpenAI Whisper API client.

    Lazy-loads the openai SDK; if unavailable, raises at construction
    so the lifespan hook can fall back to the stub.
    """

    name = "openai"

    def __init__(self, api_key: str | None = None, model: str = DEFAULT_MODEL):
        try:
            from openai import AsyncOpenAI
        except ImportError as e:
            raise RuntimeError("openai package not installed") from e
        import os
        key = api_key or os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY not set")
        self._client = AsyncOpenAI(api_key=key)
        self.model = model

    async def transcribe(
        self,
        *,
        audio_bytes: bytes,
        content_type: str,
        prompt: str | None = None,
        language: str | None = None,
    ) -> TranscriptionResult:
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise ValueError(
                f"audio bytes {len(audio_bytes)} exceeds Whisper limit "
                f"{MAX_AUDIO_BYTES}"
            )
        # OpenAI's SDK takes a file-like; wrap bytes in BytesIO with a
        # filename so the multipart upload sets the right MIME type.
        import io

        ext = _ext_from_content_type(content_type)
        file_arg = (f"audio.{ext}", io.BytesIO(audio_bytes), content_type)

        # API call. `response_format='verbose_json'` returns duration +
        # detected language alongside the text.
        resp = await self._client.audio.transcriptions.create(
            file=file_arg,
            model=self.model,
            prompt=prompt,
            language=language,
            response_format="verbose_json",
        )
        # AsyncOpenAI returns a TypedDict-ish object; pull fields safely.
        text = getattr(resp, "text", "") or resp.get("text", "")  # type: ignore[union-attr]
        detected_lang = (
            getattr(resp, "language", None)
            or (resp.get("language") if isinstance(resp, dict) else None)  # type: ignore[union-attr]
            or language
            or "en"
        )
        duration = getattr(resp, "duration", None)
        if duration is None and isinstance(resp, dict):
            duration = resp.get("duration")  # type: ignore[union-attr]

        return TranscriptionResult(
            text=text,
            language=detected_lang,
            duration_seconds=float(duration) if duration else None,
            model=self.model,
        )


def _ext_from_content_type(content_type: str) -> str:
    """Pick a file extension for the multipart form so OpenAI's
    server can dispatch the right audio decoder."""
    return {
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/wav": "wav",
        "audio/webm": "webm",
        "audio/m4a": "m4a",
        "audio/mp4": "m4a",
        "video/mp4": "mp4",
        "video/webm": "webm",
    }.get(content_type, "mp3")


# ── Module-level singleton (lifespan-injected) ────────────────────────────────


_PROVIDER: TranscriptionProvider | None = None


def get_provider() -> TranscriptionProvider | None:
    return _PROVIDER


def set_provider(p: TranscriptionProvider | None) -> None:
    """Lifespan hook: install OpenAIWhisperProvider in prod; tests
    inject the stub. None disables the route."""
    global _PROVIDER
    _PROVIDER = p


def reset_for_tests() -> None:
    set_provider(None)
