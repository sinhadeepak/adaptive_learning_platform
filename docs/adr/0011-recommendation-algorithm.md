# ADR-0011: Recommendation algorithm

- **Status**: proposed
- **Date**: 2026-04-28
- **Deciders**: CTO, Tech Lead, Product Lead
- **Related**: P3-S0 gating ADR #6, [ADR-0010](0010-predictive-analytics-model-serving.md)

## Context

P3-S5 launches the recommendation engine. Use cases:

1. **"Up next" tutor session topics** — given the student's current weak topics + recent session history, suggest 3 topics for the next live tutor session.
2. **Creator-content recommendations** — when a student is browsing the marketplace, suggest courses based on their exam + weak topics + session history.
3. **Question-bank recommendations** — for in-app practice, suggest the next topic to drill (already partially handled by IRT).

Three classical approaches:

- **Collaborative filtering** — "students like you also liked X". User-item matrix factorisation. Cold-start problem for new students.
- **Content-based** (via embeddings) — represent topics + questions + courses as embedding vectors; recommend nearest neighbours to what the student has engaged with. No cold-start problem (works on day 1 with topic embeddings alone).
- **Hybrid** — combine both, weighted.

Phase 3 pre-launch realities:

- **Cold-start dominates** — most students have < 50 quiz sessions and 0 tutor sessions when the recommendation engine first runs. Collaborative filtering needs hundreds of interactions per user before it's useful.
- **OpenAI embeddings already in the stack** — `alp-learning.adaptive` uses `text-embedding-3-small` for the AI tutor and study plan. Reusable for recommendations.
- **Interpretability matters** — students should be able to ask "why are you recommending this topic" and get an answer that's not "matrix factorisation said so".

## Decision

**Content-based recommendation via OpenAI embeddings**, with hooks for adding a collaborative-filtering signal in P3-S6+ if the data justifies it.

### Architecture

- **Topic embeddings**: every catalog topic (24 today, more in P3) is embedded once at indexing time using `text-embedding-3-small` over `(topic.title + topic.description + sample_question_stems)`. Stored in `learning.catalog.topic_embeddings` (new table; vector column via `pgvector` extension, deferred — for P3-S5 we use a JSON-in-Postgres + cosine-similarity-in-Python).
- **Student profile embedding**: weighted average of the embeddings of topics where the student has `mastery.ewa > 0.6` AND `n_attempts >= 3`. Computed nightly inside `alp-engagement.analytics.predictive` (extension of ADR-0010 module).
- **Recommendation**: at request time, compute cosine similarity between student profile embedding and all candidate topic embeddings (or course embeddings for marketplace). Return top N with a similarity score and a "why" string ("you've mastered Mechanics; this builds on it").
- **Why string**: take the top 3 contributing topics from the student profile and surface them as the explanation.
- **Storage**: cached recommendations in `analytics_schema.cached_recommendations` (refreshed nightly); on-demand fallback for fresh users.

### Hooks for collaborative-filtering augmentation (P3-S6+)

- **Reserved column**: `cached_recommendations.cf_score REAL NULL` — when CF is added, the final score becomes a weighted blend.
- **Reserved feature signal**: `engagement.analytics.predictive.cf_features` (empty in P3-S5; populated when CF lands).

This is *the* place where the predictive ADR (0010) and this ADR meet — both extend `engagement.analytics.predictive`.

## Alternatives considered

- **Pure collaborative filtering (matrix factorisation, e.g. Surprise lib)**. *Rejected* — cold-start kills it. New students see "no recommendations" until they've interacted enough. Phase 3 launch would be embarrassing.
- **Pure popularity-based ("most-booked tutor session topic this week")**. *Rejected* as the only signal — works as a fallback but doesn't personalise. Use as a tier-2 signal for cold-start users (top quartile of recommendations).
- **Vendor: Algolia Recommend, Coveo, etc.**. *Rejected* — black-box; expensive at our scale; doesn't compose with our IRT signals.
- **Self-trained embedding model (e.g. sentence-transformers fine-tuned on our content)**. *Rejected for P3-S5* — fine-tuning is research work that doesn't fit a single sprint. Revisit if OpenAI cost or latency becomes a problem at scale.
- **Use `pgvector` from the start** for native cosine-similarity indexes. *Considered, deferred*. JSON-in-Postgres + Python cosine works fine at <1M topics. `pgvector` add is a P3-S6 enhancement once the schema is settled.

## Consequences

### Positive

- **No cold-start problem** — works on day 1. New student → topic embeddings exist; profile-of-zero defaults to popular. After 1 quiz session, profile starts personalising.
- **Reuses existing OpenAI dependency** — no new vendor, no new infra.
- **Interpretable** — each recommendation comes with a "why" string. Surfaces in the UI; gives the platform a defensible "AI-powered" story.
- **Cheap inference** — embedding storage is JSON; cosine similarity in Python is microseconds. At P3 scale (50K students × 24+ topics), recomputing nightly fits in 5 minutes single-host.
- **Composable with predictive (ADR-0010)** — both modules live inside `engagement.analytics.predictive`; share feature engineering.

### Negative

- **OpenAI cost for embeddings** — `text-embedding-3-small` is $0.00002/1K tokens. Per-topic embedding (~500 tokens) is $0.00001. At 50K students nightly = ~$0.50/day. Negligible for now; revisit at million-student scale.
- **Vendor lock-in to OpenAI for embeddings** — if OpenAI deprecates the model, we re-embed with replacement. Manageable.
- **No collaborative signal in P3-S5** — students who would benefit from "people-like-me" recommendations don't get them initially. Hooks reserved for P3-S6+.
- **Latency on cold-cache lookups** — if a student's recommendation isn't cached, on-demand compute can take 100ms+. Fallback to popular topics for the no-cache path; cache-warm is the steady state.

### Follow-up work

- [ ] `learning.catalog.topic_embeddings` table + nightly indexing job (P3-S5).
- [ ] `analytics_schema.cached_recommendations` table + serve endpoint (P3-S5).
- [ ] `engagement.analytics.predictive.recommendations` module (P3-S5).
- [ ] OpenAI embedding rate-limit handling (extend the existing rate-limit infra in `alp-learning.adaptive.rate_limit`).
- [ ] "Why" string generator — pure Python; no LLM call needed. Just top-3 contributing topics.
- [ ] Integration into web-student "Up Next" home dashboard tile (P3-S5 frontend).
- [ ] A/B harness: 50% control (popularity-only) vs. 50% recommendations to measure click-through.

## Review

Revisit by **end of P3-S6** or earlier if any of:

- Recommendation CTR < 5% (popularity baseline) — the model isn't beating no-personalisation.
- OpenAI embedding cost > $1K/mo at projected end-of-P3 scale (move to self-trained embeddings).
- pgvector compatibility ships in `learning` Postgres — migrate from JSON to native vector for query speed.
- Student count > 500K with sufficient interaction signal — collaborative-filtering augmentation justifies the dev cost.
