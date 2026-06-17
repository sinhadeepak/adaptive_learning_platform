# alp-stats

Shared statistical primitives for the Adaptive Learning Platform.

This library is the bottom of the dependency stack for every
prescriptive feature: Exam Intelligence System (EIS), Probabilistic
Curriculum Engine (PCE), Adaptive Difficulty Progression (ADP),
Internal Guidance System (IGS), and the survivorship-bias-corrected
outcome estimators.

## Primitives

| Class | Used by | Purpose |
|---|---|---|
| `BetaBinomialPosterior` | Mastery tracking, P(question correct) | Conjugate Bayesian update over a Bernoulli stream — a *distribution*, not a point estimate |
| `IRTModel` (3PL) | ADP, EIS difficulty calibration | Rasch / 2PL / 3PL ability + difficulty estimation; EAP estimator |
| `ThompsonSampler` | Question selection, AI suggestion arms | Balanced explore/exploit over Bernoulli arms |
| `KaplanMeier` | Topic decay, dropout prediction | Time-to-event survival curves with confidence bands |
| `HierarchicalBayes` | Yield forecasting, cohort-level smoothing | Borrow strength across groups under sparse data |

## Validation

Every primitive ships with a regression test against a published
reference (scipy.stats / mirt-style synthetic / a textbook clinical
example). Tests live in `tests/` and are run on every CI build —
`pytest tests/`.

## Why one shared library?

Bespoke implementations scattered across services silently drift.
A buggy stats library produces wrong recommendations for years
without anyone noticing. The cure is **one** implementation per
primitive, validated once, imported everywhere.

See [docs/02_planning/Platform_Analytics_Catalogue.md](../../../docs/02_planning/Platform_Analytics_Catalogue.md)
§17 for the full statistical foundations rationale.
