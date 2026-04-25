"""Pydantic models for the flag-mgmt API (ADR-0001)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FlagOverride(BaseModel):
    tenantId: str
    value: bool
    setByUserId: str | None = None
    setAt: datetime


class Flag(BaseModel):
    name: str
    description: str
    defaultValue: bool
    dangerCritical: bool
    owner: str | None = None
    blastRadius: str | None = None
    overrideCount: int = 0
    updatedAt: datetime


class FlagAuditEntry(BaseModel):
    ts: datetime
    flagName: str
    scope: Literal["GLOBAL", "TENANT"]
    tenantId: str | None = None
    oldValue: bool | None = None
    newValue: bool | None = None
    actorUserId: str | None = None
    rationale: str | None = None


class FlagDetail(Flag):
    overrides: list[FlagOverride] = []
    audit: list[FlagAuditEntry] = []


class FlagPut(BaseModel):
    value: bool
    rationale: str | None = Field(default=None, max_length=500)


class Problem(BaseModel):
    code: str
    message: str
