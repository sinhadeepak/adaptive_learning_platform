# Deferred Items Register

**Status**: Active — running list of consciously-deferred work items.
**Owner**: Tech Lead. Add an entry when work is deferred during a PR/spike rather than dropped silently.

Each item records *what* was deferred, *why* it was safe to defer, and *what closing it requires*, so a deferral is a tracked decision rather than a forgotten gap.

---

## DEF-01 — Photo-doubt vision routed through the admin AI provider chain

**Date deferred**: 2026-06-15 · **Area**: `services/learning` — `adaptive/doubt.py`

**What**
Photo-doubt (`POST` doubt-solve, `solve_doubt`) uses `llm.call_vision_structured`, which calls **env-key OpenAI directly** and is gated on the legacy sync `llm.is_enabled()`. Unlike the text features, it does **not** route through the admin-managed provider chain (`content_schema.ai_provider_config` / `/admin/ai-providers`).

**Why deferred (safe)**
- Vision (image input) is not wired through the multi-provider layer (`learning.ai_providers`), and the providers currently enabled in the chain (Ollama text models, Anthropic) are not configured for image input here.
- Migrating its gate to `is_enabled_async()` without a vision-capable chain would make it claim "AI on" and then fail at the vision call — worse UX than the current clean stub fallback.
- It is **student-facing** (doubt solving), not part of the teacher panel that the 2026-06-15 "route teacher AI through admin providers" change targeted.

A clarifying comment was added in `adaptive/doubt.py` at the gate explaining this.

**What closing it requires**
1. Extend the multi-provider layer (`learning/ai_providers/`) with a vision-capable `call_vision_structured` equivalent that walks `ai_provider_config` (only providers/models that support image input — e.g. OpenAI `gpt-4o`, Anthropic vision models; skip text-only rows like Ollama gemma).
2. Switch `solve_doubt`'s gate to an async "vision-capable provider available?" check (a vision-aware variant of `is_enabled_async`).
3. Add a fixture-backed test mirroring `tests/.../test_doubt.py` for the chain path.

**Severity**: Low (feature degrades cleanly to stub today). **Trigger to do**: when a vision-capable provider is added to the admin chain, or photo-doubt usage grows.

---

## DEF-02 — AI Content Guardrail: submit-time L3 vector re-check + embedding/bank persistence

**Date deferred**: 2026-06-15 · **Area**: `services/learning` — `content/routes.py::create_question`, guardrail engine

**What**
The guardrail enforces L1+L2 at draft time and rejects a `FAIL` verdict at the DRAFT-write boundary (409). The **submit-time L3 re-check** on the final (possibly edited) stem — recompute MD5 + pgvector cosine, store the question `embedding`, and commit the stem hash to the Redis bank — is built (stores are injectable) but not yet wired into `create_question`.

**Why deferred (safe)**
Draft-time L1+L2 + the FAIL→409 enforcement already provide the core safety guarantee. The submit-time vector re-check is defence-in-depth against post-draft edits and bank growth; it needs migrations 040/041 applied and Redis/pgvector live (now true in the local stack).

**What closing it requires**
Wire `PgVectorStore` (real cosine query verified working) + `RedisHashStore` into `create_question`: re-run L3 on the final stem, reject on exact-dup/over-threshold, persist `embedding`, and commit the bank hash on success. Add the calibration dataset + threshold tuning.

**Severity**: Medium. **Trigger to do**: before AI-authored questions are generated at scale in a shared environment.

---

## DEF-03 — pgvector image in deployed (non-local) Postgres

**Date deferred**: 2026-06-15 · **Area**: infra / deploy

**What**
The local compose Postgres was switched to `pgvector/pgvector:pg15` (migration 040 needs `CREATE EXTENSION vector`). Staging/prod Postgres images/instances must also provide pgvector ≥ 0.5.0 (for HNSW) before 040 is applied there.

**What closing it requires**
Ensure the deployed Postgres (RDS/Aurora parameter group or image) has the `vector` extension available and allowed; then run `make migrate-all` / the content migrations to head.

**Severity**: Medium (blocks guardrail L3 in deployed envs). **Trigger to do**: next staging cutover.

---

### Index

| # | Item | Area | Severity | Trigger |
|---|---|---|---|---|
| DEF-01 | Photo-doubt vision via admin provider chain | learning/adaptive/doubt.py | Low | Vision-capable provider added to chain |
| DEF-02 | Guardrail submit-time L3 + embedding/bank persistence | learning/content + guardrail | Medium | Before AI authoring at scale |
| DEF-03 | pgvector in deployed Postgres | infra | Medium | Next staging cutover |
