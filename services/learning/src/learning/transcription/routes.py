"""Transcription HTTP route (P5-S62).

  POST /content/ai/transcribe   multipart/form-data { audio | language? }

The audio/video authoring UI uploads a media file → backend transcribes
via Whisper → returns text + detected language + duration. Author edits
+ approves; the approved transcript becomes part of the question payload
(LISTENING_COMP.transcript / VIDEO_QUESTION.transcript).

Gating: the route is open whenever the transcription provider is
configured, but the audio/video question handlers themselves stay gated
behind `audio_video_questions_enabled` — so authors can preview
transcription quality before the family flips on.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from learning.transcription.provider import (
    MAX_AUDIO_BYTES,
    TranscriptionResult,
    get_provider,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/content/ai", tags=["transcription"])


class TranscriptionResponse(BaseModel):
    text: str
    language: str
    duration_seconds: float | None
    model: str


@router.post("/transcribe", response_model=TranscriptionResponse)
async def post_transcribe(
    audio: UploadFile = File(..., description="Audio or video file"),
    language: str | None = Form(default=None),
    prompt: str | None = Form(default=None),
) -> TranscriptionResponse:
    """Transcribe an uploaded audio/video file via Whisper.

    Returns 503 when no transcription provider is wired (dev without
    OPENAI_API_KEY); 413 when payload exceeds Whisper's 25 MB limit;
    400 on malformed input.
    """
    provider = get_provider()
    if provider is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "transcription_unavailable",
                "message": "Transcription provider not configured.",
            },
        )

    if not audio.content_type or not (
        audio.content_type.startswith("audio/")
        or audio.content_type.startswith("video/")
    ):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "bad_content_type",
                "message": (
                    f"Expected audio/* or video/*; got "
                    f"{audio.content_type!r}"
                ),
            },
        )

    raw = await audio.read()
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "payload_too_large",
                "message": (
                    f"Audio is {len(raw)} bytes; Whisper limit is "
                    f"{MAX_AUDIO_BYTES}."
                ),
            },
        )

    try:
        result: TranscriptionResult = await provider.transcribe(
            audio_bytes=raw,
            content_type=audio.content_type,
            prompt=prompt,
            language=language,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": "bad_audio", "message": str(e)},
        ) from e
    except Exception as e:  # noqa: BLE001
        log.exception("transcription failed")
        raise HTTPException(
            status_code=502,
            detail={
                "code": "transcription_provider_error",
                "message": str(e),
            },
        ) from e

    return TranscriptionResponse(
        text=result.text,
        language=result.language,
        duration_seconds=result.duration_seconds,
        model=result.model,
    )
