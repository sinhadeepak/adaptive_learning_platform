"""Phase 5 (P5-S62) — Whisper transcription pipeline.

Per ENG-OAQ-9 closure: OpenAI Whisper API picked over self-hosted.
Lower operational burden + the same model quality. Rationale:

  - $0.006/minute (current OpenAI pricing) — well under the AI cost
    target of $0.20 per published question for typical 1-3 minute
    audio/video clips
  - Same provider as the rest of the AI Gateway (DPDP agreement
    already signed via ADR-0019 OpenAI primary decision)
  - Avoids GPU infra ops we'd own with self-hosted Whisper

Used by the audio/video authoring flow (LISTENING_COMP /
VIDEO_QUESTION). Author uploads audio/video → backend POSTs to
/audio/transcriptions → returns transcript → author edits +
approves before submit.

The transcription route is gated by `audio_video_questions_enabled`
flag; when off, the route returns 503 FEATURE_DISABLED but the
provider clients still work for tests.
"""

from __future__ import annotations

from learning.transcription.provider import (
    TranscriptionProvider,
    TranscriptionResult,
    StubTranscriptionProvider,
    OpenAIWhisperProvider,
)

__all__ = [
    "TranscriptionProvider",
    "TranscriptionResult",
    "StubTranscriptionProvider",
    "OpenAIWhisperProvider",
]
