"""Pricing-band tests — Pydantic-level (no DB)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from marketplace.schemas import HOURLY_CEILING_PAISE, HOURLY_FLOOR_PAISE, TutorApplyIn


def _base(rate: int) -> dict:
    return {
        "displayName": "Test Tutor",
        "headline": "Test headline",
        "bio": "",
        "hourlyRatePaise": rate,
        "qualifications": [],
        "availability": [],
        "topicIds": [],
    }


def test_floor_accepted() -> None:
    p = TutorApplyIn.model_validate(_base(HOURLY_FLOOR_PAISE))
    assert p.hourlyRatePaise == HOURLY_FLOOR_PAISE


def test_ceiling_accepted() -> None:
    p = TutorApplyIn.model_validate(_base(HOURLY_CEILING_PAISE))
    assert p.hourlyRatePaise == HOURLY_CEILING_PAISE


def test_below_floor_rejected() -> None:
    with pytest.raises(ValidationError):
        TutorApplyIn.model_validate(_base(HOURLY_FLOOR_PAISE - 1))


def test_above_ceiling_rejected() -> None:
    with pytest.raises(ValidationError):
        TutorApplyIn.model_validate(_base(HOURLY_CEILING_PAISE + 1))


def test_zero_rejected() -> None:
    with pytest.raises(ValidationError):
        TutorApplyIn.model_validate(_base(0))


def test_negative_rejected() -> None:
    with pytest.raises(ValidationError):
        TutorApplyIn.model_validate(_base(-1000))
