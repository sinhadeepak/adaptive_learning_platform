// AdaptsExplainerCard — "how this adapts" first-quiz educator (P6 S54).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S54
//
// One-time card that surfaces the difficulty-agency model in plain
// English. Per ADR-0022 the engine has two adaptation paths:
//
//   1. Pre-quiz intent — student picks match / push / build_confidence;
//      shifts initial θ̂ by ±0.4.
//   2. Mid-quiz friction — engine watches for 3-wrong / 3-fast-correct /
//      hesitation / double-skip and offers ONE prompt per session.
//
// Caller gates rendering on `hasSeenAdaptsExplainer()` from the
// difficulty-agency lib; the dismiss button flips the flag.

import {
  hasSeenAdaptsExplainer,
  markAdaptsExplainerSeen,
} from "../lib/difficulty-agency";

export interface AdaptsExplainerCardProps {
  /** Called after the user dismisses (the card persists the seen flag itself). */
  onDismiss?: () => void;
}

export function AdaptsExplainerCard({ onDismiss }: AdaptsExplainerCardProps) {
  if (hasSeenAdaptsExplainer()) return null;

  function handleDismiss() {
    markAdaptsExplainerSeen();
    onDismiss?.();
  }

  return (
    <section
      className="adapts-explainer"
      aria-label="How adaptive practice works"
    >
      <header className="adapts-head">
        <span className="adapts-glyph" aria-hidden>
          ✦
        </span>
        <h3 className="adapts-title">How adaptive practice works</h3>
        <button
          type="button"
          className="adapts-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss explainer"
        >
          ✕
        </button>
      </header>
      <div className="adapts-grid">
        <div className="adapts-cell">
          <div className="adapts-cell-num">1</div>
          <h4 className="adapts-cell-title">Pick your intent before each round</h4>
          <p className="adapts-cell-copy">
            <strong>Match</strong>, <strong>push</strong>, or{" "}
            <strong>build confidence</strong>. The engine shifts where it
            starts but never changes how your mastery is scored.
          </p>
        </div>
        <div className="adapts-cell">
          <div className="adapts-cell-num">2</div>
          <h4 className="adapts-cell-title">The engine watches as you go</h4>
          <p className="adapts-cell-copy">
            If you nail three in a row or stumble on three in a row, it
            offers <strong>one</strong> mid-round nudge to step difficulty
            up or down. You always get the final call.
          </p>
        </div>
        <div className="adapts-cell">
          <div className="adapts-cell-num">3</div>
          <h4 className="adapts-cell-title">Tell us how it felt</h4>
          <p className="adapts-cell-copy">
            At the end, mark whether the round was <strong>too easy</strong>,{" "}
            <strong>just right</strong>, or <strong>too hard</strong>. We
            calibrate the next session — not your mastery score.
          </p>
        </div>
      </div>
      <p className="adapts-footer">
        Mastery (EWA) only updates from how you actually answered. Intent and
        feedback shape <em>what's served</em>, never <em>what's recorded</em>.
      </p>
    </section>
  );
}
