# ADR-0019: AI Gateway + service-consolidation rationale

- **Status**: proposed
- **Date**: 2026-04-30
- **Deciders**: CTO, Tech Lead, ML Lead, Sec Lead, Finance Lead
- **Related**: P5-S37 gating ADR. Natural extension of [ADR-0005](0005-service-consolidation.md) (service consolidation 12 → 5 + 1). Substrate for [ADR-0017](0017-multi-parameter-assessment-engine.md) (multi-parameter mastery — AI evaluation feeds bloom_mastery, fluency, confidence) and [ADR-0018](0018-polymorphic-question-types-and-resolution.md) (Type Handler Protocol — AI authoring + AI evaluation hooks). Source doc: [AI & Multilingual Architecture](../additional_requirements/AI_Multilingual_Architecture.md).

## Context

The Phase 5 build plan (multi-parameter engine, S37–S48) introduces five AI touchpoints platform-wide:

1. **Authoring assist** — `draft_question`, `expand_explanation`, `suggest_distractors` (S40).
2. **Quality checks** — ambiguity, distractor plausibility, duplicate detection, syllabus tagging, difficulty estimation, tone (S40 + S45).
3. **Evaluation** — rubric-driven LLM grading for SHORT_TEXT (AI_ASSISTED), ESSAY / DESCRIPTIVE_LONG / CASE_STUDY (HYBRID) (S42).
4. **Translation** — per-language pipeline with glossary injection + cultural review (S43).
5. **Vision** — image moderation + diagram authoring assist (S44).

If each touchpoint calls an LLM provider directly:

- **Vendor lock-in.** Switching from Anthropic to OpenAI to Google requires touching every call site.
- **No central observability.** AI cost per touchpoint per provider per day is unknowable. AI failures are diagnosed by tail-grepping each service.
- **No cost control.** Per-creator quotas can't be enforced consistently. A buggy authoring loop could burn ₹50K of provider tokens before anyone notices.
- **PII risk surface multiplies.** Every call site is a potential PII leak to the provider. Auditing 5 call sites for DPDP compliance is harder than auditing 1.
- **Prompt versioning silently drifts.** Each call site picks a prompt template whenever convenient; reproducibility breaks.
- **Free-form output failures.** Each call site parses LLM responses ad-hoc; "almost-valid JSON" failures cascade.

The [AI & Multilingual Architecture](../additional_requirements/AI_Multilingual_Architecture.md) v1.0 prescribes an **AI Gateway** to centralise every LLM call. It also identifies AI Authoring, Localisation, and Evaluation as logically distinct services — but the **Service Consolidation Addendum** (referenced in that doc's intro) revises the deployment model: only the AI Gateway's responsibilities ship; AI Authoring, Localisation, and Evaluation fold into existing services (Content / Quiz / Moderation in their original framing — for ALP, these all collapse into `alp-learning` per [ADR-0005](0005-service-consolidation.md)).

ADR-0005 sets the service ceiling at **6 deployable services** (5 today + 1 reserved for marketplace). This ADR resolves where the AI capabilities land **without exceeding the ceiling**.

## Decision

**Every LLM call (authoring, quality, evaluation, translation, vision) goes through a single internal AI Gateway running as a module inside `alp-learning`. AI Authoring, Localisation, and Evaluation likewise fold into `alp-learning` as modules. No 7th service.** ADR-0005's service ceiling is preserved.

**Per user direction 2026-04-30: OpenAI is the sole real LLM provider in v1** (primary `gpt-4o`, fallback `gpt-4o-mini`; structured outputs via `response_format`). The provider-abstraction architecture stays in place so a future vendor flip (Anthropic / Google / Llama) remains a config change in `ai_routing.yaml`, not a code change — but Anthropic / Google / Llama clients ship later, only when needed. The provider Literal in `ai_gateway/routing.py` is narrowed to `{openai, stub}` so a YAML typo fails Pydantic validation rather than silently routing to a non-existent provider.

### Module layout inside `alp-learning`

```
services/learning/src/learning/
├── ai_gateway/        # NEW (S38) — single door for every LLM call
│   ├── router.py             # routing config + provider dispatch
│   ├── providers/{openai,stub}.py  # v1: OpenAI only + stub for tests
│   │                                # (anthropic / google / llama deferred —
│   │                                #  per user direction 2026-04-30)
│   ├── pii_scrubber.py       # pre-call regex + anonymisation token map
│   ├── quotas.py             # Redis-backed per-touchpoint + per-creator
│   ├── prompt_registry.py    # versioned YAML loader
│   └── telemetry.py          # Prometheus + 90-day audit log
│
├── ai_authoring/      # NEW (S40) — wraps Gateway with type-aware drafts
│   ├── draft.py              # draft_question / expand_explanation / suggest_distractors
│   ├── ai_draft_marker.py    # AI_DRAFT audit + edit_distance tracking
│   └── quality_checks/       # 6 checks (ambiguity, plausibility, duplicate, syllabus, difficulty, tone)
│
├── localisation/      # NEW (S43) — translation pipeline + glossary
│   ├── translator.py
│   ├── glossary.py
│   └── cultural_review.py
│
└── evaluation/        # NEW (S38–S43) — Resolution dispatcher + grader queue
    ├── dispatcher.py         # routes by evaluation_mode (DETERMINISTIC / AI_ASSISTED / HYBRID / HUMAN)
    ├── grader_queue.py       # human grader queue (S43)
    └── calibration.py        # weekly Cohen's kappa (S43)
```

### AI Gateway calling convention

```python
result = await ai_gateway.call(
    touchpoint="quality_check",
    prompt_template_id="mcq_quality",
    prompt_template_version="3.1.0",       # explicit version, no implicit "latest"
    prompt_inputs={"stem": "...", "options": [...]},
    schema=QualityReportSchema,             # JSON schema enforced
)
# result is a validated QualityReportSchema instance, never a string.
```

### Provider routing (`/config/ai_routing.yaml`)

Per-touchpoint primary + fallback. Reload-on-config-change. Switching Anthropic ↔ OpenAI ↔ Google is a config change, not a code change.

### Structured-output discipline

Every Gateway call passes a JSON schema. Provider's native structured-output mechanism (Anthropic tool use, OpenAI tool calls, Google function calling). Free-form text completions disallowed in production paths. Validation enforced before the Gateway returns to the caller.

### PII scrubbing middleware

Pre-call regex scan for email / phone / student-name patterns. Replaced with `[EMAIL]`, `[PHONE]`, `[NAME]` placeholders. Anonymisation token map stored per-call for reverse-mapping in evaluation feedback. Provider data-retention configured to zero where supported (Anthropic / OpenAI / Google enterprise tier).

### Per-touchpoint + per-creator quotas

Redis-backed. Defaults: 50 authoring/creator/day, 100 translations/creator/day, unlimited quality_check (background), 200 platform-wide authoring/minute, 500 platform-wide evaluation/minute. Quotas enforced *before* the provider call.

### Observability + audit

Per-call audit row: `(call_id, touchpoint, prompt_version, input_hash, provider, latency, tokens_in, tokens_out, cost_usd, status)`. Retained 90 days. Cost dashboard with 80% / 95% monthly-budget alerts.

### Calibration pipeline

5% of HYBRID evaluation responses route to humans regardless of AI confidence (deterministic via `hash(response_id) % 20 == 0`). Weekly batch computes Cohen's kappa per criterion. Kappa < 0.7 → criterion auto-paused, 100% human routing, ML alert.

### Failure degradation

| Failure | Behaviour |
|---|---|
| Provider timeout / 5xx | Auto-retry on fallback provider. Per-touchpoint provider health on dashboard. Circuit breaker opens after 5 consecutive failures, retries after 60s. |
| Both providers fail | `AIGatewayError` raised; calling handler degrades per its own semantics. |
| Vision provider down | PICTORIAL_IDENTIFY authoring assist disabled (manual only); vision-based quality checks skip. |
| Translation budget exhausted | Translation jobs queue FIFO; alert at 80% / 95% of monthly budget. |
| Calibration kappa < 0.7 | AI evaluation auto-paused for that criterion; 100% human routing; ML alert within 24h. |
| Gateway itself down | All AI features disabled. Authoring continues manual (no draft assist). Evaluation falls back to DETERMINISTIC types only; AI_ASSISTED + HYBRID responses queued for humans. Translation jobs queue. Platform never silently degrades. |

## Alternatives considered

- **AI Gateway as 7th service.** *Rejected* — violates ADR-0005's ceiling of 6. The natural home for the Gateway is `alp-learning` because the bulk of LLM consumers (authoring, quality check, translation, evaluation) are content-shaped and already live there. Splitting Gateway out adds operational overhead (one more pod, dashboard, secret rotation, CI lane) for no architectural win at current scale. ADR-0021 (deferred, no sprint claimed) reserves the option to split when alp-learning latency p95 crosses a threshold or AI traffic justifies independent scaling.
- **Per-service direct provider calls (no Gateway).** *Rejected* — every drawback in the Context section materialises: vendor lock-in, no central observability, no cost control, PII risk, prompt drift, parse failures. The Gateway is mandatory for production discipline; the only question is where it lives, and that's answered by ADR-0005 + this ADR.
- **Unstructured prompt outputs (no JSON schema enforcement).** *Rejected* — production parse failures are a class of bug we eliminate by JSON schema discipline at the Gateway. Every provider supports structured output natively; using it costs nothing and removes a tail of "the LLM almost returned the right shape" bugs.
- **Implicit "latest" prompt versioning.** *Rejected* — auditability requires explicit `(prompt_template_id, version)` per call. "Latest" silently breaks reproducibility (a prompt edit on Tuesday changes Monday's AI evaluation behaviour). Versioning is mandatory; calls without an explicit version fail at registry-load time.
- **Self-host one provider (Llama 3.1) for cost.** *Considered, partially adopted.* Self-hosted Llama is reserved for high-sensitivity paths (PII-bearing student-response evaluation in Phase 2) where data residency or cost concerns dominate. ENG-OAQ-1 + ENG-OAQ-2 close the decision before S38. v1 routing config does not assume self-hosted.
- **Vendor-managed evaluation API (e.g. OpenAI evals).** *Rejected* — ties calibration metrics to the vendor's product roadmap. Cohen's kappa per criterion is a stable methodology that survives vendor changes.

## Consequences

### Positive

- **ADR-0005 service ceiling preserved.** No 7th service. AI capabilities ship as modules inside `alp-learning` — the natural home for content-shaped LLM consumers. Operational overhead does not grow with AI feature surface.
- **Vendor flips become config changes.** `/config/ai_routing.yaml` switches Anthropic ↔ OpenAI ↔ Google per touchpoint without redeploy. Vendor pricing shifts, model deprecations, and quality regressions become non-events from an operational standpoint.
- **AI usage is observable + budgeted.** Per-call audit log retained 90 days. Per-touchpoint cost metrics on the dashboard. Forecast-vs-budget visible to admins + finance. Per-touchpoint and per-creator quotas enforced *before* the provider call. Cost overrun risk is bounded.
- **PII is contained at the platform boundary.** Pre-call scrubber + anonymisation token map + provider zero-data-retention configured. DPDP compliance has a single audit surface (the Gateway's middleware) rather than 5 scattered call sites. Self-hosted Llama is the escape hatch for high-sensitivity paths.
- **Calibration prevents silent AI drift.** Weekly kappa per criterion + auto-pause at < 0.7 + ML alert. AI evaluation never silently degrades; the platform notices before students do.
- **Structured-output discipline eliminates parse-failure tails.** JSON schema enforced at every Gateway call; "almost-valid" outputs become errors at the boundary, not bugs in caller code.

### Negative

- **alp-learning grows materially.** Four new modules (`ai_gateway`, `ai_authoring`, `localisation`, `evaluation`) add ~5K LOC + Redis dependency for quotas. Mitigated: modules have clean boundaries; existing `adaptive` / `catalog` / `content` / `doubts` / `search` are untouched at their own boundaries. Code review focuses per-module; no monolith collapse.
- **Latency p95 on alp-learning may rise.** Gateway calls add ~5–15s to AI-backed paths. Mitigated: DETERMINISTIC grading stays in-process with zero AI latency. Only AI_ASSISTED + HYBRID + HUMAN evaluation cross the Gateway boundary. Most student-facing latency is unaffected.
- **AI Gateway is now a single point of failure for AI features.** Mitigated: graceful degradation per the failure-mode table above. Platform never goes down because AI is down; AI features disable, deterministic paths continue, queued work resumes when Gateway recovers.
- **Provider DPDP compliance is a gating decision (ENG-OAQ-2).** Each AI provider's data-retention agreement must satisfy DPDP for student data. This is a Legal + Sec decision that must close before S38. If no provider satisfies DPDP, the v1 routing config falls back to self-hosted Llama for sensitive paths only.
- **Cost guardrail thresholds are estimates.** Defaults (50 authoring/creator/day, ₹0.20 per published question, ₹0.05 per evaluated subjective response) are educated guesses based on current model pricing. Mitigated: dashboards make actuals visible weekly; per-touchpoint quotas adjustable via admin UI without redeploy. First 30 days of S38 will surface realistic ranges.
- **Calibration depends on human grader supply (ENG-OAQ-3).** 5% HYBRID sampling + per-criterion kappa requires a steady human-grader pipeline. Mitigated: S43 plans the Human Grader Application + grader staffing decision before launch. If human supply is constrained, sampling rate becomes a knob rather than a hard 5%.

### Follow-up work

- [ ] `services/learning/src/learning/ai_gateway/` package — router + providers + PII scrubber + quotas + prompt registry + telemetry (P5-S38).
- [x] `/config/ai_routing.yaml` seeded with OpenAI primary + OpenAI fallback per touchpoint (P5-S38). Anthropic primary deferred per user direction 2026-04-30.
- [ ] Prompt template registry under `prompts/{authoring,quality_check,evaluation,translation,vision}/*.yaml` (P5-S38).
- [ ] Provider clients with circuit breaker + retry + fallback wiring (P5-S38).
- [ ] PII scrubbing middleware + anonymisation token map (P5-S38).
- [ ] Redis-backed per-touchpoint + per-creator quotas (P5-S38).
- [ ] Per-call audit log (Postgres `content_schema.ai_generation_jobs` for authoring; structured log for non-persistent calls) (P5-S38).
- [ ] Cost dashboard at `apps/web-portal/src/pages/CostDashboard.tsx` (P5-S45).
- [ ] Calibration sampling pipeline + `content_schema.calibration_samples` (P5-S43).
- [ ] Weekly Cohen's kappa batch + auto-pause hook (P5-S43).
- [ ] Calibration dashboard at `apps/web-portal/src/pages/CalibrationDashboard.tsx` (P5-S47).
- [ ] DPDP review of provider data-retention agreements — gates S38 (ENG-OAQ-2; Legal + Sec).
- [ ] Self-hosted Llama feasibility study — gates S38 sensitive paths (ENG-OAQ-1; ML Eng + Sec).
- [ ] Human grader staffing plan — gates S43 (ENG-OAQ-3; Operations).

## Review

Revisit by **end of P5-S43** (Phase 5 mid-sprint review) or earlier if:

- alp-learning latency p95 exceeds the SLO (currently `< 500 ms` for non-AI paths; AI paths < 8 s p95) due to AI Gateway co-location — split Gateway to its own pod via ADR-0021.
- Monthly AI spend forecast exceeds 120% of the agreed budget for two consecutive months — quotas tightened or routing config shifted to cheaper models.
- Calibration kappa drops below 0.7 on more than 2 criteria simultaneously — the LLM evaluation strategy itself is reconsidered; ADR amends to capture the policy change.
- A vendor introduces a non-negotiable contract change (e.g. mandatory data retention for training) — routing config flips to fallback provider and ADR amends to reflect the new primary.
- AI Gateway becomes a > 2 KLOC code surface with multiple unrelated touchpoints — extract to its own module hierarchy or service per the deferred ADR-0021 trigger.
