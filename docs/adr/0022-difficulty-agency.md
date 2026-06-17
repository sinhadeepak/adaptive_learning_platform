# ADR-0022: Difficulty agency model — intent · friction · calibration

- **Status**: accepted (frontend + backend shipped — see Phase 5/6 commits)
- **Date**: 2026-05-02
- **Deciders**: CTO, Tech Lead, Product Lead, Design Lead, ML Lead
- **Related**: Phase 6 ADR family. Companion to [ADR-0020](0020-ux-copilot-scope-and-ia.md). Builds on [ADR-0017](0017-multi-parameter-assessment-engine.md) (multi-parameter mastery — intent never modifies EWA writes) and the IRT machinery in `services/learning/src/learning/adaptive/irt.py`.

## Context

The platform's adaptive engine picks every item via 3PL IRT-MFI. Today the student has zero say over what's served — they take the engine's pick or skip. That works for the median student but creates two failure modes:

1. **Anxious students** stop practicing because the engine occasionally serves something genuinely hard; they read it as failure.
2. **Confident students** feel the engine is "easy mode" because it converges to their θ̂ and stops stretching them.

The original UX register proposed:

- Pre-quiz: 3 buttons (Match my level / Push me / Build confidence)
- Mid-quiz: 2 buttons (Make easier / Make harder) always visible
- Post-quiz: 3 buttons (Too easy / Right level / Too hard)

The UX Recommendations Review pushes back on this with a stronger model: **two visible controls + one passive signal**. The reviewer's argument is empirically grounded — putting persistent +/− difficulty buttons on a mobile quiz turns it into a control panel, increases cognitive load mid-question, and worse: invites students to game the engine ("Make easier" when they don't want to fail).

The engine is also at risk: if "Build confidence" silently inflates EWA gains or "Push me" dampens penalties, mastery scores become non-comparable across students. **The engine's scoring model must remain sealed.**

## Decision

Adopt the reviewer's **two-visible + one-passive** model. Difficulty agency is expressed at three moments, each with a distinct purpose:

| Moment | Surface | Type | Effect on engine |
|---|---|---|---|
| **Pre-quiz** | 3-button intent selector | Visible | Sets initial θ̂ offset (±0.4) for the session only |
| **Mid-quiz** | Friction prompt ("Adjust difficulty?") | **Passive** — only fires on heuristic triggers | One-time θ̂ offset adjustment of ±0.2; dismissable |
| **Post-quiz** | 1-question session calibration | Visible | Feeds next session's intent default; does NOT modify this session's mastery write |

### Pre-quiz intent (3 buttons)

| Button | Tooltip | θ̂ offset | Default in copy |
|---|---|---|---|
| **Match my level** | The engine picks at your current level. | 0 | Default selected, returning students |
| **Push me** | Start one band harder, still adapts. | +0.4 | Confident students opt in |
| **Build confidence** | Start one band easier, rebuild momentum. | −0.4 | Anxious / returning-from-break students |

The offset only applies to **initial item selection** — the EAP estimator updates θ̂ from real responses on the same scoring rule for everyone. Mastery EWA writes never see the intent_anchor.

### Mid-quiz friction prompt (passive)

The prompt fires *at most once per session*, only when one of these heuristics triggers:

| Heuristic | Trigger condition | Suggested adjustment |
|---|---|---|
| **Repeated wrong** | 3 consecutive wrong answers | Offer ↓ |
| **Repeated very-fast correct** | 3 consecutive correct in < 5 s each | Offer ↑ |
| **Long hesitation** | One answer with `time_spent_ms > 30000` | Offer ↓ |
| **Repeated skip** | 2 consecutive skips | Offer ↓ |

UI: a non-modal sheet near the bottom of the screen *"Adjust difficulty? · Easier / Same / Harder"*. Default is *Same* (no-op dismiss). If the student picks *Easier* / *Harder* the engine applies a one-time θ̂ offset of ±0.2 from the next item onwards.

The friction prompt **never** appears mid-question — only between questions. **Never** fires more than once per session.

### Post-quiz session calibration (1 question)

Right after the score band, ask:

> *How did this session feel?* — **Too easy / Right level / Too hard**

The answer feeds two places:
1. Default intent for the next session (e.g. 3 *"Too hard"* in a row → next session defaults to "Build confidence")
2. Calibration row in `quiz_sessions.calibration_feedback`, used by the engine's intent-anchor heuristic in S57's recovery mode (a student who repeatedly says "too hard" + misses sessions enters recovery mode faster)

### Sealed: scoring rules never change

The intent_anchor and calibration_feedback values are **session metadata only**. The IRT estimator, EWA mastery write, error-classifier output, and rank prediction all run on identical rules regardless of the student's posture choice. This is the load-bearing invariant of the agency model.

Concretely:

```python
# services/learning/src/learning/adaptive/irt.py — what intent does
def select_initial_item(intent_anchor: str, theta_hat: float) -> Question:
    offset = {"match": 0.0, "push": +0.4, "build_confidence": -0.4}[intent_anchor]
    return select_mfi(theta_hat + offset, candidates, exposure_cap=...)

# services/engagement/src/engagement/analytics/mastery.py — what intent does NOT do
def update_ewa(user_id, topic_id, is_correct):
    # intent_anchor is NOT read here; α = 0.4 is sealed; same write for every student
    ...
```

## Alternatives considered (rejected)

- **Original 3+2+3 model.** Rejected per reviewer — too control-heavy for mobile, invites gaming.
- **Hide all controls; engine decides everything.** Rejected — anxious students disengage; confident students feel under-stretched. We'd lose engagement signal.
- **Let intent modify scoring (e.g. "Push me" gets a 1.2× mastery multiplier).** Rejected — non-comparable mastery scores across students; breaks rank prediction (ADR-0015) and Bloom-mastery calibration (ADR-0017). Sacrosanct.
- **Per-question difficulty toggle ("make this one easier") instead of session-level.** Rejected — invites gaming + adds cognitive load mid-question + collides with the IRT MFI logic, which selects the next item from a pool, not by absolute difficulty.
- **Use mid-quiz friction prompt without heuristic gating (always show).** Rejected per reviewer — turns the quiz into a control panel; the *passive signal* layer is precisely what avoids that.

## Consequences

### Positive

- **Anxious students stay engaged.** "Build confidence" is a face-saving way to say "ease me in"; the engine still adapts, mastery still updates.
- **Confident students get stretch.** "Push me" + the very-fast-correct heuristic catches the "this is too easy" pattern without the student having to interrupt themselves.
- **Engine integrity preserved.** Mastery is comparable across students because intent_anchor is metadata, not a multiplier.
- **One-tap dismissibility** on the friction prompt — students who don't want a control panel never see one (they tap *Same* and continue).
- **Honest signalling** (per ADR-0019 hard constraints) — the post-quiz calibration is a deliberate *student* signal, not an algorithm tweak.

### Negative

- **Heuristic tuning required.** The mid-quiz friction triggers (3 consecutive, < 5s, > 30s, 2 skips) are best-effort defaults. Real-world tuning needs telemetry — we'll iterate via UX-34 events from S49.
- **Three controls vs zero is still more than zero.** Some students will ignore the pre-quiz selector and the post-quiz calibration. Mitigated by: defaults work fine without input; "Match my level" is the assumed default; calibration is a single tap, dismissable.
- **"Push me" + repeated wrong** is the worst case — student picks aggressive intent then bombs. Friction prompt catches this on the 3rd wrong answer; calibration captures the lesson at session end. Recovery-mode (S57) catches the longer-term version.

### Follow-up work

- [ ] **S54** quiz_sessions schema gains `intent_anchor` (text) + `calibration_feedback` (text, nullable)
- [ ] **S54** `POST /quiz/sessions/start` accepts `intent_anchor` (default "match")
- [ ] **S54** `POST /quiz/sessions/{id}/calibration` writes `calibration_feedback`
- [ ] **S54** IRT initial-θ̂-offset logic in `services/learning/src/learning/adaptive/irt.py`
- [ ] **S54** mid-quiz friction prompt heuristic in `services/learning/src/learning/adaptive/friction_prompt.py`
- [ ] **S54** pre-quiz intent selector + tooltip + adaptive-trust explainer card on first quiz (UX-28)
- [ ] **S54** post-quiz calibration sheet
- [ ] **S57** recovery-mode reads `calibration_feedback` history to escalate
- [ ] **Post-S58** telemetry-driven heuristic tuning via the UX-34 event stream (`difficulty.intent.set`, `difficulty.friction.shown`, `difficulty.friction.taken`, `difficulty.calibration.set`)

## Review

The load-bearing invariant is "intent_anchor is session metadata, never modifies mastery writes." Quarterly engineering review confirms no code path in `services/learning` or `services/engagement` reads `intent_anchor` or `calibration_feedback` from a mastery / readiness / IRT-θ-update path.
