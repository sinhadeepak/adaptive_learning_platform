"""Tests for KaplanMeier.

Reference dataset: a small textbook example (Klein & Moeschberger
Ch 4, leukemia remission times) — we hard-code expected S(t) values
matching their published table so any future refactor that breaks
the math fails CI immediately.
"""

from __future__ import annotations

import math

import pytest

from alp_stats.survival import KaplanMeier


class TestBasicFit:
    def test_no_censoring_drops_at_each_event(self) -> None:
        # 5 subjects, all observed events at increasing times.
        # KM at each event time = (n - 1) / n × previous.
        durations = [1.0, 2.0, 3.0, 4.0, 5.0]
        events = [1, 1, 1, 1, 1]
        c = KaplanMeier.fit(durations, events)
        expected = [4/5, 3/5, 2/5, 1/5, 0.0]
        for i, exp in enumerate(expected):
            assert c.survival[i] == pytest.approx(exp, abs=1e-10), (
                f"S({c.times[i]}) expected {exp}, got {c.survival[i]}"
            )

    def test_all_censored_keeps_s_at_1(self) -> None:
        # If everyone is censored, no events → S(t) = 1 throughout.
        durations = [1.0, 2.0, 3.0]
        events = [0, 0, 0]
        c = KaplanMeier.fit(durations, events)
        assert all(s == 1.0 for s in c.survival)

    def test_at_before_first_event(self) -> None:
        c = KaplanMeier.fit([2.0, 4.0, 6.0], [1, 1, 1])
        # Before t=2, S is 1.
        assert c.at(0.0) == 1.0
        assert c.at(1.5) == 1.0

    def test_at_step_function_semantics(self) -> None:
        # S drops at each event time. The "at(t)" call returns the
        # most recent event-time's S for any t.
        c = KaplanMeier.fit([2.0, 4.0, 6.0], [1, 1, 1])
        # S(2) = 2/3, S(4) = 1/3, S(6) = 0
        assert c.at(2.0) == pytest.approx(2/3, abs=1e-10)
        assert c.at(3.0) == pytest.approx(2/3, abs=1e-10)   # plateau
        assert c.at(4.0) == pytest.approx(1/3, abs=1e-10)
        assert c.at(5.5) == pytest.approx(1/3, abs=1e-10)
        assert c.at(6.0) == 0.0
        assert c.at(100.0) == 0.0


class TestKleinMoeschberger:
    """Textbook 4.1A — leukemia remission times in weeks.

    6-MP treatment arm (Freireich et al. 1963), as reported in
    Klein & Moeschberger (2003). Times in weeks; '+' is censoring.

    Times:  6, 6, 6, 6+, 7, 9+, 10, 10+, 11+, 13, 16, 17+,
            19+, 20+, 22, 23, 25+, 32+, 32+, 34+, 35+
    """

    DATA = [
        (6, 1), (6, 1), (6, 1), (6, 0),
        (7, 1), (9, 0), (10, 1), (10, 0),
        (11, 0), (13, 1), (16, 1), (17, 0),
        (19, 0), (20, 0), (22, 1), (23, 1),
        (25, 0), (32, 0), (32, 0), (34, 0), (35, 0),
    ]

    def test_matches_published_table(self) -> None:
        # KM at the 7 event times: published S values from K&M Table 4.1A.
        # Times: 6, 7, 10, 13, 16, 22, 23
        expected = {
            6:  0.857,
            7:  0.807,
            10: 0.753,
            13: 0.690,
            16: 0.627,
            22: 0.538,
            23: 0.448,
        }
        durations = [d for d, _ in self.DATA]
        events = [e for _, e in self.DATA]
        c = KaplanMeier.fit(durations, events)
        for t, exp in expected.items():
            assert c.at(float(t)) == pytest.approx(exp, abs=5e-3), (
                f"S({t}) expected {exp}, got {c.at(float(t))}"
            )


class TestCIBands:
    def test_ci_brackets_survival(self) -> None:
        c = KaplanMeier.fit([1.0, 2.0, 3.0, 4.0, 5.0], [1, 1, 1, 1, 1])
        for i in range(len(c.survival)):
            # CI must bracket the point estimate (except at S=0 where
            # log-log CI is degenerate by construction).
            if c.survival[i] > 0:
                assert c.ci_low[i] <= c.survival[i] <= c.ci_high[i] + 1e-9

    def test_ci_widens_with_few_events(self) -> None:
        # 100 subjects all event at the same time → narrow CI.
        many_dur = [10.0] * 100
        many_evt = [1] * 100
        c_many = KaplanMeier.fit(many_dur, many_evt)
        # 3 subjects all event → wide CI.
        few_dur = [10.0, 10.0, 10.0]
        few_evt = [1, 1, 1]
        c_few = KaplanMeier.fit(few_dur, few_evt)
        width_many = c_many.ci_high[0] - c_many.ci_low[0]
        width_few = c_few.ci_high[0] - c_few.ci_low[0]
        # Both will be very narrow at S=0; this test is mainly a
        # smoke check that CIs don't degenerate.
        assert width_few >= width_many - 1e-9


class TestMedianSurvival:
    def test_median_when_curve_crosses_half(self) -> None:
        c = KaplanMeier.fit([1.0, 2.0, 3.0, 4.0, 5.0], [1, 1, 1, 1, 1])
        # S values: 0.8, 0.6, 0.4, 0.2, 0.0. Median = first t with S ≤ 0.5,
        # which is t=3 (S=0.4).
        assert c.median() == 3.0

    def test_median_undefined_if_no_crossing(self) -> None:
        # All censored → no crossing.
        c = KaplanMeier.fit([1.0, 2.0, 3.0], [0, 0, 0])
        assert c.median() is None


class TestValidation:
    def test_mismatched_lengths(self) -> None:
        with pytest.raises(ValueError):
            KaplanMeier.fit([1.0, 2.0], [1])

    def test_empty_input(self) -> None:
        with pytest.raises(ValueError):
            KaplanMeier.fit([], [])

    def test_invalid_event(self) -> None:
        with pytest.raises(ValueError):
            KaplanMeier.fit([1.0], [2])
