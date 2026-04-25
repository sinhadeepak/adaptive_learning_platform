"""Unit tests for the IRT math module — no FastAPI involvement."""

from __future__ import annotations

import math

import pytest

from adaptive_engine.irt import (
    CandidateItem,
    D,
    Item,
    Response,
    eap_estimate,
    fisher_information,
    prob_correct,
    select_mfi,
)


def test_prob_correct_at_difficulty_equals_midpoint() -> None:
    """When θ == b, the logistic returns 0.5 so P = c + (1-c)/2."""
    item = Item(a=1.0, b=0.5, c=0.2)
    assert prob_correct(0.5, item) == pytest.approx(0.2 + 0.8 / 2, rel=1e-9)


def test_prob_correct_monotone_in_theta() -> None:
    item = Item(a=1.5, b=0.0, c=0.1)
    p_low = prob_correct(-2.0, item)
    p_mid = prob_correct(0.0, item)
    p_hi = prob_correct(2.0, item)
    assert p_low < p_mid < p_hi
    assert p_low >= item.c  # never below the guessing floor


def test_prob_correct_asymptote_to_one() -> None:
    item = Item(a=2.0, b=0.0, c=0.0)
    assert prob_correct(10.0, item) == pytest.approx(1.0, abs=1e-6)


def test_prob_correct_numerically_stable_at_extremes() -> None:
    # Extremely large positive z: ensures no math overflow.
    item = Item(a=2.5, b=-3.0, c=0.0)
    assert 0.999 < prob_correct(50.0, item) <= 1.0
    item2 = Item(a=2.5, b=3.0, c=0.0)
    assert 0.0 <= prob_correct(-50.0, item2) < 0.001


def test_fisher_info_peaks_near_b() -> None:
    item = Item(a=1.5, b=0.5, c=0.0)
    info_at_b = fisher_information(0.5, item)
    info_far = fisher_information(-3.0, item)
    assert info_at_b > info_far
    info_far2 = fisher_information(3.5, item)
    assert info_at_b > info_far2


def test_fisher_info_higher_for_higher_a() -> None:
    sharp = Item(a=2.0, b=0.0, c=0.0)
    flat = Item(a=0.5, b=0.0, c=0.0)
    assert fisher_information(0.0, sharp) > fisher_information(0.0, flat)


def test_eap_no_responses_returns_prior() -> None:
    theta, se = eap_estimate([], prior_mean=0.0, prior_sd=1.0)
    assert theta == pytest.approx(0.0, abs=1e-3)
    assert se == pytest.approx(1.0, abs=2e-2)


def test_eap_increases_with_correct_responses() -> None:
    item = Item(a=1.5, b=0.0, c=0.1)
    # Five correct in a row should pull θ̂ above zero.
    theta, _ = eap_estimate([Response(item=item, is_correct=True)] * 5)
    assert theta > 0.4
    theta_neg, _ = eap_estimate([Response(item=item, is_correct=False)] * 5)
    assert theta_neg < -0.4


def test_eap_se_shrinks_with_more_responses() -> None:
    item = Item(a=1.5, b=0.0, c=0.1)
    _, se_few = eap_estimate([Response(item=item, is_correct=True)] * 2)
    _, se_many = eap_estimate(
        [Response(item=item, is_correct=True)] * 5 + [Response(item=item, is_correct=False)] * 5
    )
    assert se_many < se_few


def test_select_mfi_picks_highest_info() -> None:
    # All items at the same b but different a; sharper item wins at θ=b.
    sharp = CandidateItem(id="sharp", item=Item(a=2.5, b=0.0, c=0.0))
    medium = CandidateItem(id="medium", item=Item(a=1.0, b=0.0, c=0.0))
    flat = CandidateItem(id="flat", item=Item(a=0.5, b=0.0, c=0.0))
    chosen = select_mfi(theta=0.0, candidates=[medium, flat, sharp])
    assert chosen is not None and chosen.id == "sharp"


def test_select_mfi_respects_exclude() -> None:
    sharp = CandidateItem(id="sharp", item=Item(a=2.5, b=0.0, c=0.0))
    medium = CandidateItem(id="medium", item=Item(a=1.0, b=0.0, c=0.0))
    chosen = select_mfi(theta=0.0, candidates=[medium, sharp], exclude={"sharp"})
    assert chosen is not None and chosen.id == "medium"


def test_select_mfi_exposure_cap_deprioritizes_overused_items() -> None:
    sharp = CandidateItem(id="sharp", item=Item(a=2.5, b=0.0, c=0.0))
    medium = CandidateItem(id="medium", item=Item(a=1.0, b=0.0, c=0.0))
    chosen = select_mfi(
        theta=0.0,
        candidates=[medium, sharp],
        exposure_count={"sharp": 5},  # at cap
        exposure_cap=5,
    )
    assert chosen is not None and chosen.id == "medium"


def test_select_mfi_falls_back_to_capped_when_no_under_cap() -> None:
    only_one = [CandidateItem(id="only", item=Item(a=1.5, b=0.0, c=0.0))]
    chosen = select_mfi(
        theta=0.0,
        candidates=only_one,
        exposure_count={"only": 99},
        exposure_cap=5,
    )
    assert chosen is not None and chosen.id == "only"


def test_select_mfi_returns_none_on_empty() -> None:
    assert select_mfi(theta=0.0, candidates=[]) is None


def test_item_validation_rejects_bad_a_and_c() -> None:
    with pytest.raises(ValueError):
        Item(a=0.0, b=0.0, c=0.0)
    with pytest.raises(ValueError):
        Item(a=1.0, b=0.0, c=1.0)
    with pytest.raises(ValueError):
        Item(a=1.0, b=0.0, c=-0.1)


def test_logistic_constant() -> None:
    # Sanity: logistic with D=1.7 is well-known approximation.
    assert D == 1.7
    item = Item(a=1.0, b=0.0, c=0.0)
    # logistic(D · 1) at θ=1, b=0, a=1 ≈ 1/(1 + e^{-1.7}) ≈ 0.846
    assert prob_correct(1.0, item) == pytest.approx(1.0 / (1.0 + math.exp(-1.7)), rel=1e-9)
