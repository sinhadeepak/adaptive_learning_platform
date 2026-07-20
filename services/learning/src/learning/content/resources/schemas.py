"""Pydantic schemas for /content/resources endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

ResourceType = Literal[
    "youtube_video", "youtube_playlist", "url", "note", "document"
]
ResourceStatus = Literal["DRAFT", "IN_REVIEW", "PUBLISHED", "REJECTED", "REMOVED"]
Difficulty = Literal["EASY", "MEDIUM", "HARD"]


class SearchResultItem(BaseModel):
    """One row from the YouTube search proxy."""
    video_id: str
    title: str
    description: str | None = None
    channel_name: str | None = None
    duration_seconds: int | None = None
    thumbnail_url: str | None = None
    published_at: datetime | None = None
    view_count: int | None = None


class SearchResponse(BaseModel):
    items: list[SearchResultItem]
    source: Literal["live", "cache", "stub"] = "live"
    daily_quota_remaining: int | None = None
    note: str | None = None


class ResourceCreate(BaseModel):
    """Pin a resource to one or more scopes. The four scope fields
    are independent — a TEACHER can attach a single video to a
    topic AND to a specific question (two rows). The validator
    forces at least one scope per row."""
    topic_id: UUID | None = None
    concept_id: UUID | None = None
    question_id: UUID | None = None
    resource_type: ResourceType = "youtube_video"
    external_id: str | None = Field(default=None, max_length=120)
    # Optional at the schema layer: a 'document' row carries its location in
    # doc_object_key and the server fills `url` from it. The validator below
    # requires url for every non-document type.
    url: str | None = Field(default=None, max_length=600)
    title: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=4000)
    channel_name: str | None = Field(default=None, max_length=200)
    duration_seconds: int | None = Field(default=None, ge=0, le=24 * 3600)
    thumbnail_url: str | None = Field(default=None, max_length=600)
    language: str = Field(default="en", pattern="^(en|hi|ta|te|bn|mr)$")
    difficulty: Difficulty | None = None
    position: int = Field(default=0, ge=0)
    # Document (PDF/file) fields — required only when resource_type='document'.
    doc_object_key: str | None = Field(default=None, max_length=600)
    doc_mime_type: str | None = Field(default=None, max_length=120)
    doc_size_bytes: int | None = Field(default=None, ge=0)
    doc_page_count: int | None = Field(default=None, ge=0)
    # HMAC claim from /uploads/presign proving the caller uploaded
    # doc_object_key. Required for resource_type='document'.
    upload_claim: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _at_least_one_scope(self) -> "ResourceCreate":
        if not (self.topic_id or self.concept_id or self.question_id):
            raise ValueError(
                "Pass at least one of topic_id / concept_id / question_id."
            )
        return self

    @model_validator(mode="after")
    def _document_or_url(self) -> "ResourceCreate":
        if self.resource_type == "document":
            if not self.doc_object_key:
                raise ValueError("A 'document' resource requires doc_object_key.")
        elif not self.url or len(self.url) < 4:
            raise ValueError("url is required (min 4 chars) for non-document types.")
        return self


class ResourceDetail(BaseModel):
    id: UUID
    topic_id: UUID | None
    concept_id: UUID | None
    question_id: UUID | None
    resource_type: ResourceType
    external_id: str | None
    url: str
    title: str
    description: str | None
    channel_name: str | None
    duration_seconds: int | None
    thumbnail_url: str | None
    language: str
    difficulty: Difficulty | None
    status: ResourceStatus
    position: int
    added_by: UUID
    added_at: datetime
    approved_by: UUID | None
    approved_at: datetime | None
    review_notes: str | None
    is_available: bool
    doc_object_key: str | None = None
    doc_mime_type: str | None = None
    doc_size_bytes: int | None = None
    doc_page_count: int | None = None


class ResourceList(BaseModel):
    items: list[ResourceDetail]
    total: int = 0


# ─────────────────────────────────────────────────────────────────────
# Study Materials hub — exam-wide content tree + watch summary
# ─────────────────────────────────────────────────────────────────────


class TopicContent(BaseModel):
    topic_id: UUID
    topic_title: str
    resources: list[ResourceDetail]
    counts: dict[str, int] = Field(default_factory=dict)


class SubjectContent(BaseModel):
    subject_id: UUID
    subject_name: str
    topics: list[TopicContent]


class ExamContentTree(BaseModel):
    exam_id: UUID
    subjects: list[SubjectContent]


class ResourceWatchProgress(BaseModel):
    furthestPositionSeconds: int = 0
    resumePositionSeconds: int = 0
    furthestPercent: int = 0
    watched: bool = False


class TopicWatchProgress(BaseModel):
    minutesWatched: int = 0
    resourcesWatched: int = 0
    resourcesCompleted: int = 0
    documentsCompleted: int = 0


class WatchSummary(BaseModel):
    user_id: UUID
    exam_id: UUID
    perResource: dict[str, ResourceWatchProgress] = Field(default_factory=dict)
    perTopic: dict[str, TopicWatchProgress] = Field(default_factory=dict)


class ReviewDecision(BaseModel):
    approve: bool
    notes: str | None = Field(default=None, max_length=500)


class ViewEventCreate(BaseModel):
    event_type: Literal["started", "25pct", "50pct", "75pct", "completed", "closed"]
    position_seconds: int | None = Field(default=None, ge=0)
    session_id: UUID | None = None


# ─────────────────────────────────────────────────────────────────────
# AI suggestions for the teacher curator
# ─────────────────────────────────────────────────────────────────────


class AISuggestRequest(BaseModel):
    topic_id: UUID | None = None
    topic_title: str = Field(min_length=2, max_length=200)
    topic_description: str | None = Field(default=None, max_length=1000)
    language: str = Field(default="en", pattern="^(en|hi|ta|te|bn|mr)$")
    weak_concept: str | None = Field(default=None, max_length=200)
    exam: str | None = Field(default=None, max_length=60)


class AISuggestQueryItem(BaseModel):
    query: str
    rationale: str
    difficulty: Difficulty


class AISuggestResponse(BaseModel):
    queries: list[AISuggestQueryItem]
    source: Literal["ai", "heuristic"] = "heuristic"
    model: str | None = None
    prompt_template_id: str | None = None
    prompt_template_version: str | None = None
