"""Pydantic schemas for /content/resources endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

ResourceType = Literal["youtube_video", "youtube_playlist", "url", "note"]
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
    url: str = Field(min_length=4, max_length=600)
    title: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=4000)
    channel_name: str | None = Field(default=None, max_length=200)
    duration_seconds: int | None = Field(default=None, ge=0, le=24 * 3600)
    thumbnail_url: str | None = Field(default=None, max_length=600)
    language: str = Field(default="en", pattern="^(en|hi|ta|te|bn|mr)$")
    difficulty: Difficulty | None = None
    position: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _at_least_one_scope(self) -> "ResourceCreate":
        if not (self.topic_id or self.concept_id or self.question_id):
            raise ValueError(
                "Pass at least one of topic_id / concept_id / question_id."
            )
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


class ResourceList(BaseModel):
    items: list[ResourceDetail]
    total: int = 0


class ReviewDecision(BaseModel):
    approve: bool
    notes: str | None = Field(default=None, max_length=500)


class ViewEventCreate(BaseModel):
    event_type: Literal["started", "25pct", "50pct", "75pct", "completed", "closed"]
    position_seconds: int | None = Field(default=None, ge=0)
    session_id: UUID | None = None
