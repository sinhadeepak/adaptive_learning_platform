"""Commission split tests — pure function in stripe_connect."""

from __future__ import annotations

import pytest

from marketplace import stripe_connect


def test_default_15_percent() -> None:
    # ₹100 = 10000 paise; 15% = 1500 paise commission, 8500 to tutor.
    commission, tutor = stripe_connect.commission_split(10000)
    assert commission == 1500
    assert tutor == 8500


def test_override_to_zero() -> None:
    """A 'first 10 tutors get 0% commission' grandfather override per ADR-0007."""
    commission, tutor = stripe_connect.commission_split(10000, override_rate=0.0)
    assert commission == 0
    assert tutor == 10000


def test_override_to_30_percent() -> None:
    commission, tutor = stripe_connect.commission_split(50000, override_rate=0.3)
    assert commission == 15000
    assert tutor == 35000


def test_invalid_rate_rejected() -> None:
    with pytest.raises(ValueError):
        stripe_connect.commission_split(10000, override_rate=1.5)
    with pytest.raises(ValueError):
        stripe_connect.commission_split(10000, override_rate=-0.1)


def test_rounds_so_tutor_never_short() -> None:
    """Half-paisa edge: 333 paise × 15% = 49.95 → rounds to 50, tutor gets 283."""
    commission, tutor = stripe_connect.commission_split(333)
    assert commission == 50
    assert tutor == 283
    assert commission + tutor == 333
