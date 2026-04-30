# Architecture Decision Records (ADRs)

We document significant architectural decisions here. Use the [template](0000-template.md) for new ADRs.

**Numbering**: sequential, zero-padded to 4 digits. Start with ADR-0001.

**Lifecycle**: `proposed` → `accepted` | `rejected`. Once accepted, never edit in-place — supersede with a new ADR.

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-feature-flag-platform.md) | Feature flag platform (GAP-07) | proposed | 2026-04-21 |
| [0002](0002-flutter-mobile-stack.md) | Flutter for mobile (iOS + Android) | proposed | 2026-04-21 |
| [0003](0003-three-web-app-split.md) | Three-web-app split (Vite + React) | proposed | 2026-04-21 |
| [0004](0004-checkout-platform.md) | Checkout / payment platform (Stripe) | proposed | 2026-04-22 |
| [0005](0005-service-consolidation.md) | Service consolidation 12 → 5 (+ 1 reserved P3) | proposed | 2026-04-28 |
| [0006](0006-kyc-vendor.md) | KYC vendor (Stripe Identity) | proposed | 2026-04-28 |
| [0007](0007-stripe-connect-rollout.md) | Stripe Connect rollout (Express + 15% + weekly) | proposed | 2026-04-28 |
| [0008](0008-marketplace-pricing-model.md) | Marketplace pricing (creator-set within bands) | proposed | 2026-04-28 |
| [0009](0009-tutor-session-realtime-signalling.md) | Tutor session real-time signalling (NATS + Daily.co) | proposed | 2026-04-28 |
| [0010](0010-predictive-analytics-model-serving.md) | Predictive analytics model serving (pure Python) | proposed | 2026-04-28 |
| [0011](0011-recommendation-algorithm.md) | Recommendation algorithm (content-based via embeddings) | proposed | 2026-04-28 |
| [0012](0012-exam-blueprint-pyq-schema.md) | Exam blueprint metadata + PYQ schema (Phase 4) | proposed | 2026-04-28 |
| [0013](0013-time-per-question-analytics.md) | Time-per-question + per-section analytics (Phase 4) | proposed | 2026-04-28 |
| [0014](0014-spaced-repetition-scheduling.md) | Spaced-repetition scheduling (SM-2 + EWA tie-in) (Phase 4) | proposed | 2026-04-28 |
| [0015](0015-calibrated-rank-prediction.md) | Calibrated rank prediction (cohort-driven) (Phase 4) | proposed | 2026-04-28 |
| [0016](0016-error-pattern-classification.md) | Error-pattern classification taxonomy (Phase 4) | proposed | 2026-04-28 |
| [0017](0017-multi-parameter-assessment-engine.md) | Multi-parameter assessment engine (9 dimensions, concept grain) (Phase 5) | proposed | 2026-04-30 |
| [0018](0018-polymorphic-question-types-and-resolution.md) | Polymorphic question types via Type Handler Protocol + Resolution contract (Phase 5) | proposed | 2026-04-30 |
| [0019](0019-ai-gateway-and-consolidation.md) | AI Gateway as module inside alp-learning (preserves ADR-0005 ceiling) (Phase 5) | proposed | 2026-04-30 |
