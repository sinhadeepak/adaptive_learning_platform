"""Pydantic models for /search/* — matches openapi/phase1.yaml."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class SearchHit(BaseModel):
    type: Literal["topic", "lesson", "question"]
    id: str
    title: str
    subtitle: str | None = None
    path: str | None = None
    score: float | None = None


class SearchResults(BaseModel):
    results: list[SearchHit]
    total: int
    page: int
    perPage: int
    tookMs: int | None = None


class TypeaheadHit(BaseModel):
    type: Literal["topic", "lesson", "question"]
    id: str
    title: str
    path: str | None = None


class ReindexResult(BaseModel):
    indexed: int
