"""Regression tests for ThompsonSampler.

The hardest test is the *regret* test: over many rounds against a
known true distribution, the sampler should converge on the best arm.
We use a small synthetic two-armed bandit so it runs in < 1 s.
"""

from __future__ import annotations

import pytest

from alp_stats import BetaBinomialPosterior
from alp_stats.thompson import ThompsonSampler


class TestConstruction:
    def test_arm_ids_only(self) -> None:
        s = ThompsonSampler(arm_ids=["a", "b", "c"])
        assert len(s) == 3
        assert s.mean("a") == pytest.approx(0.5, abs=1e-6)

    def test_priors_only(self) -> None:
        priors = {
            "a": BetaBinomialPosterior(alpha=10.0, beta=2.0),
            "b": BetaBinomialPosterior(alpha=2.0, beta=10.0),
        }
        s = ThompsonSampler(priors=priors)
        assert len(s) == 2
        assert s.mean("a") > s.mean("b")

    def test_construction_requires_input(self) -> None:
        with pytest.raises(ValueError):
            ThompsonSampler()

    def test_add_arm_idempotent(self) -> None:
        s = ThompsonSampler(arm_ids=["a"])
        s.update("a", reward=1)
        s.update("a", reward=1)
        # adding 'a' again must not reset accumulated posterior
        s.add_arm("a")
        assert s.mean("a") > 0.5

    def test_add_new_arm(self) -> None:
        s = ThompsonSampler(arm_ids=["a"])
        s.add_arm("b")
        assert len(s) == 2


class TestUpdate:
    def test_correct_update_raises_mean(self) -> None:
        s = ThompsonSampler(arm_ids=["a"])
        before = s.mean("a")
        s.update("a", reward=1)
        assert s.mean("a") > before

    def test_wrong_update_lowers_mean(self) -> None:
        s = ThompsonSampler(arm_ids=["a"])
        before = s.mean("a")
        s.update("a", reward=0)
        assert s.mean("a") < before

    def test_rejects_unknown_arm(self) -> None:
        s = ThompsonSampler(arm_ids=["a"])
        with pytest.raises(KeyError):
            s.update("zzz", reward=1)

    @pytest.mark.parametrize("reward", [-1, 2, 0.5])
    def test_rejects_invalid_reward(self, reward) -> None:
        s = ThompsonSampler(arm_ids=["a"])
        with pytest.raises(ValueError):
            s.update("a", reward=reward)


class TestPick:
    def test_pick_returns_known_arm(self) -> None:
        s = ThompsonSampler(arm_ids=["a", "b", "c"])
        chosen = s.pick()
        assert chosen in {"a", "b", "c"}

    def test_pick_eligibility_filter(self) -> None:
        s = ThompsonSampler(arm_ids=["a", "b", "c"])
        for _ in range(20):
            chosen = s.pick(eligible={"a", "b"})
            assert chosen in {"a", "b"}

    def test_pick_empty_eligibility_raises(self) -> None:
        s = ThompsonSampler(arm_ids=["a", "b"])
        with pytest.raises(RuntimeError):
            s.pick(eligible={"zzz"})

    def test_deterministic_with_seed(self) -> None:
        # Same seed → same sequence.
        s1 = ThompsonSampler(arm_ids=["a", "b", "c", "d"], rng_seed=42)
        s2 = ThompsonSampler(arm_ids=["a", "b", "c", "d"], rng_seed=42)
        seq1 = [s1.pick() for _ in range(10)]
        seq2 = [s2.pick() for _ in range(10)]
        assert seq1 == seq2

    def test_seed_advances_across_picks(self) -> None:
        # Without per-pick seed mutation, calling pick() N times in
        # a row with no updates would deterministically return the
        # same arm — defeating exploration. Our implementation must
        # vary the draw between picks even with a fixed base seed.
        s = ThompsonSampler(arm_ids=["a", "b", "c", "d"], rng_seed=0)
        picks = [s.pick() for _ in range(30)]
        # We expect at least 2 distinct picks across 30 trials with
        # uniform priors. (Statistically near-impossible to see one.)
        assert len(set(picks)) >= 2


class TestRegret:
    """The acid test for any bandit: over many rounds, the sampler
    must converge on the best arm.

    We construct a two-arm bandit where arm 'good' has true success
    rate 0.7 and arm 'bad' has 0.3. After 200 rounds, the sampler
    should pick 'good' substantially more often than 'bad'.
    """

    def test_converges_on_best_arm(self) -> None:
        import random

        rng = random.Random(7)
        truth = {"good": 0.7, "bad": 0.3}

        s = ThompsonSampler(arm_ids=list(truth.keys()), rng_seed=42)
        picks: list[str] = []
        for _ in range(200):
            arm = s.pick()
            picks.append(arm)
            reward = 1 if rng.random() < truth[arm] else 0
            s.update(arm, reward=reward)

        # In the second half of the run, 'good' should dominate.
        late_half = picks[100:]
        good_share = sum(1 for p in late_half if p == "good") / len(late_half)
        assert good_share > 0.7, (
            f"Expected ≥ 70% 'good' picks in second half; got {good_share:.2f}"
        )
        # Posterior mean of 'good' should also be close to 0.7
        assert 0.6 < s.mean("good") < 0.8

    def test_beats_uniform_random_baseline(self) -> None:
        """Cumulative reward of Thompson should exceed pure random."""
        import random

        rng = random.Random(13)
        truth = {"a": 0.8, "b": 0.5, "c": 0.2}

        # Thompson arm
        ts = ThompsonSampler(arm_ids=list(truth.keys()), rng_seed=100)
        ts_reward = 0
        for _ in range(300):
            arm = ts.pick()
            r = 1 if rng.random() < truth[arm] else 0
            ts_reward += r
            ts.update(arm, reward=r)

        # Random baseline
        baseline_reward = 0
        for _ in range(300):
            arm = rng.choice(list(truth.keys()))
            baseline_reward += 1 if rng.random() < truth[arm] else 0

        # Thompson should beat random by a meaningful margin —
        # arms differ enough (0.8 vs 0.5 vs 0.2) that this is reliable.
        assert ts_reward > baseline_reward + 30, (
            f"Thompson {ts_reward} should beat random {baseline_reward} by ≥ 30"
        )


class TestRepr:
    def test_repr_includes_arm_count(self) -> None:
        s = ThompsonSampler(arm_ids=["a", "b", "c"])
        assert "3" in repr(s)
