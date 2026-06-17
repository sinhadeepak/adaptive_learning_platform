"""Pydantic payload + response contracts for the 2 Audio/Video types (GATED).

Both types compose child questions over a media artifact (audio or
video). Whisper transcription is wired in S47 but submission stays
gated until `audio_video_questions_enabled` flips.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class AudioVideoChildReference(BaseModel):
    """Reference to a child question. Optional `timestamp_seconds` when
    the child references a specific moment in the media."""

    question_id: str
    ordinal: int = Field(ge=1)
    timestamp_seconds: float | None = Field(default=None, ge=0)


# ── LISTENING_COMP ───────────────────────────────────────────────────────────


class ListeningCompPayload(BaseModel):
    audio_media_id: str  # FK → content_media; mp3/wav
    transcript: str = Field(min_length=20, max_length=20_000)
    transcript_language: str = Field(default="en", min_length=2, max_length=8)
    child_questions: list[AudioVideoChildReference] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def _ordinals_unique_and_dense(self) -> "ListeningCompPayload":
        ords = [c.ordinal for c in self.child_questions]
        if len(ords) != len(set(ords)):
            raise ValueError("child ordinals must be unique")
        if sorted(ords) != list(range(1, len(ords) + 1)):
            raise ValueError(
                f"child ordinals must be 1..N consecutive; got {sorted(ords)}"
            )
        return self


class ListeningCompResponse(BaseModel):
    children: list["AVChildResponse"] = Field(default_factory=list)


# ── VIDEO_QUESTION ───────────────────────────────────────────────────────────


class VideoQuestionPayload(BaseModel):
    video_media_id: str  # FK → content_media; mp4
    transcript: str | None = Field(default=None, max_length=20_000)
    transcript_language: str = Field(default="en", min_length=2, max_length=8)
    child_questions: list[AudioVideoChildReference] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def _ordinals_unique_and_dense(self) -> "VideoQuestionPayload":
        ords = [c.ordinal for c in self.child_questions]
        if len(ords) != len(set(ords)):
            raise ValueError("child ordinals must be unique")
        if sorted(ords) != list(range(1, len(ords) + 1)):
            raise ValueError(
                f"child ordinals must be 1..N consecutive; got {sorted(ords)}"
            )
        return self


class VideoQuestionResponse(BaseModel):
    children: list["AVChildResponse"] = Field(default_factory=list)


class AVChildResponse(BaseModel):
    question_id: str
    response_payload: dict[str, object]


ListeningCompResponse.model_rebuild()
VideoQuestionResponse.model_rebuild()
