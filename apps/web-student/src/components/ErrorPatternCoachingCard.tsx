// ErrorPatternCoachingCard — UX-33 (Phase 6 S58).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S58
//
// Renders a coaching card for the top error pattern in the rollup.
// Coaching copy is pinned per ErrorTag (six-axis classifier from
// Sprint 29 / ADR-0016). Caller passes the rolled-up rows; we pick
// the highest-count one and render a "do this" CTA.

import { Link } from "react-router-dom";

import {
  summarisePatterns,
  tagLabel,
  type ErrorTag,
  type PatternRollup,
} from "../lib/error_patterns";

const COACHING_COPY: Record<ErrorTag, { whyItHappens: string; doThis: string }> = {
  silly_mistake: {
    whyItHappens:
      "Most often it's reading the question wrong, transcription slips, or arithmetic done in your head.",
    doThis:
      "Slow your pen down on the first 20 seconds. Read the stem twice. Underline what's actually being asked.",
  },
  conceptual_gap: {
    whyItHappens:
      "The underlying idea hasn't fully landed — the wrong pick is internally consistent with a missing concept.",
    doThis:
      "Open the concept profile for the worst-hit topic. Watch the short explainer + do a 5-question recall round.",
  },
  time_pressure: {
    whyItHappens:
      "You're answering correctly when given time, but the clock is biting on the last third.",
    doThis:
      "Pace drills: 5 mock questions on a 90-second per-Q timer. Get under the pressure on purpose.",
  },
  formula_error: {
    whyItHappens:
      "Right approach, wrong formula — sign, exponent, or constant flipped mid-derivation.",
    doThis:
      "Build a formula sheet for the worst-hit topic this week. Re-derive each one from scratch once.",
  },
  sign_or_unit_error: {
    whyItHappens:
      "Numbers right, dimensions wrong — m/s vs km/h, − instead of +, mol vs grams.",
    doThis:
      "Write units on every line. After the answer, do a 5-second 'does this magnitude make sense?' check.",
  },
  unattempted: {
    whyItHappens:
      "You're skipping more than answering. Could be time, confidence, or the questions feel out of reach.",
    doThis:
      "Pick build_confidence as your next intent — the engine will start you below your θ̂ so the rhythm comes back.",
  },
};

export interface ErrorPatternCoachingCardProps {
  rollup: PatternRollup | null;
}

export function ErrorPatternCoachingCard({
  rollup,
}: ErrorPatternCoachingCardProps) {
  // Defensive: callers may pass a partially-shaped response. The card
  // is a soft surface, so any malformed input is treated as "no
  // coaching to show".
  if (!rollup || !Array.isArray(rollup.topPatterns)) return null;
  const summary = summarisePatterns(rollup);
  if (summary.length === 0) return null;
  const top = summary[0];
  const copy = COACHING_COPY[top.classification];
  return (
    <section
      className="epc-card"
      aria-label="Error pattern coaching"
    >
      <header className="epc-head">
        <span className="epc-glyph" aria-hidden>
          ◆
        </span>
        <div>
          <div className="epc-eyebrow">Top error pattern</div>
          <h3 className="epc-title">{tagLabel(top.classification)}</h3>
          <p className="epc-sub">
            {top.count} occurrence{top.count === 1 ? "" : "s"} across recent
            sessions.
          </p>
        </div>
      </header>
      <div className="epc-section">
        <div className="epc-section-label">Why it happens</div>
        <p className="epc-section-body">{copy.whyItHappens}</p>
      </div>
      <div className="epc-section">
        <div className="epc-section-label">Try this</div>
        <p className="epc-section-body">{copy.doThis}</p>
      </div>
      <Link to="/diagnostic-deep-dive" className="epc-cta">
        Open the full report →
      </Link>
    </section>
  );
}
