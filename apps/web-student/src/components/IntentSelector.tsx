// IntentSelector — pre-quiz difficulty-intent picker (Phase 6 S54).
//
// Three options: match (=) · push (↑) · build confidence (↓).
// Per ADR-0022:
//   - intent is sealed from mastery writes (the choice never changes
//     the EWA update — only the initial item selection bias).
//   - the engine's selector is still IRT-driven; intent shifts the
//     starting θ̂ by ±0.4.
//
// Used by:
//   - Pre-quiz "Adjust difficulty" modal launched from QuizSessionMenu
//     (S51 placeholder → S54 wiring).
//   - Topic-detail "Start practice" CTA when the student wants a
//     specific frame for the next session.

import { useEffect, useState } from "react";

import {
  INTENT_DESCRIPTIONS,
  INTENT_GLYPHS,
  INTENT_LABELS,
  previewIntentOffset,
  type IntentAnchor,
  type IntentOffset,
} from "../lib/difficulty-agency";

export interface IntentSelectorProps {
  /**
   * Current selection. Defaults to `match` if undefined. The component
   * is fully controlled — caller owns the value.
   */
  value: IntentAnchor;
  onChange: (next: IntentAnchor) => void;
  /**
   * Optional θ̂ for the live offset preview. Defaults to 0 (median).
   * When provided, the selector calls /adaptive/intent/theta-offset
   * to show the effective θ̂ for the choice.
   */
  thetaHat?: number;
  /**
   * When true, the help copy under the buttons is hidden — used in
   * dense surfaces (e.g. the bottom-sheet on mobile).
   */
  compact?: boolean;
}

const ORDER: IntentAnchor[] = ["build_confidence", "match", "push"];

export function IntentSelector({
  value,
  onChange,
  thetaHat,
  compact = false,
}: IntentSelectorProps) {
  const [offset, setOffset] = useState<IntentOffset | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Preview the offset whenever the chosen intent or theta changes.
  // Errors are non-fatal — the selector still works without the
  // preview line.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await previewIntentOffset(value, thetaHat ?? 0);
        if (!cancelled) {
          setOffset(next);
          setPreviewError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewError(
            e instanceof Error ? e.message : "Couldn't preview offset.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, thetaHat]);

  return (
    <div className="intent-selector" role="radiogroup" aria-label="Difficulty intent">
      <div className="intent-buttons">
        {ORDER.map((opt) => {
          const isActive = opt === value;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`intent-btn${isActive ? " is-active" : ""}`}
              onClick={() => onChange(opt)}
            >
              <span className="intent-glyph" aria-hidden>
                {INTENT_GLYPHS[opt]}
              </span>
              <span className="intent-label">{INTENT_LABELS[opt]}</span>
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className="intent-help">{INTENT_DESCRIPTIONS[value]}</p>
      )}
      {offset && !previewError && (
        <div className="intent-preview" aria-live="polite">
          <span className="intent-preview-label">Effective θ̂</span>
          <span className="intent-preview-value">
            {formatTheta(offset.effectiveTheta)}{" "}
            <span className="intent-preview-delta">
              ({formatOffset(offset.offset)})
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function formatTheta(t: number): string {
  const sign = t >= 0 ? "+" : "−";
  return `${sign}${Math.abs(t).toFixed(2)}`;
}

function formatOffset(o: number): string {
  if (o === 0) return "no shift";
  return o > 0 ? `+${o.toFixed(2)} harder` : `${o.toFixed(2)} easier`;
}
