// FrictionPrompt — mid-quiz adaptive nudge (Phase 6 S54).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S54
// ADR:  docs/adr/0022-difficulty-agency.md
//
// Caller (Quiz.tsx) calls `checkFriction` after each verdict; when a
// trigger fires, the modal opens with the LLM-free heuristic message
// + accept / decline / dismiss controls. Per ADR-0022 only one prompt
// fires per session — once the student responds we never ask again.

import { useEffect } from "react";

import {
  frictionReasonLabel,
  type FrictionAction,
  type FrictionTrigger,
} from "../lib/difficulty-agency";

export interface FrictionPromptProps {
  trigger: FrictionTrigger | null;
  /**
   * "Accept" applies the suggested offset (Quiz Go's later sprint will
   * actually shift θ̂; for v0 we record the choice and the caller
   * decides what to do with the offset).
   */
  onAccept: (offset: number, action: FrictionAction) => void;
  /** "Dismiss" closes the prompt without applying the offset. */
  onDismiss: () => void;
}

export function FrictionPrompt({
  trigger,
  onAccept,
  onDismiss,
}: FrictionPromptProps) {
  // Esc closes — same pattern as QuizSessionMenu.
  useEffect(() => {
    if (!trigger) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trigger, onDismiss]);

  if (!trigger) return null;

  return (
    <div
      className="friction-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="friction-title"
      onClick={onDismiss}
    >
      <div
        className="friction-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="friction-eyebrow">
          ◈ Heads up · {frictionReasonLabel(trigger.reason)}
        </div>
        <h3 id="friction-title" className="friction-title">
          {trigger.message}
        </h3>
        <p className="friction-sub">
          Tap accept to {trigger.suggestedAction === "easier" ? "ease the difficulty" : trigger.suggestedAction === "harder" ? "step difficulty up" : "keep the current pace"} for the rest of the round.
        </p>
        <div className="friction-actions">
          <button
            type="button"
            className="friction-btn friction-btn-secondary"
            onClick={onDismiss}
          >
            Stay the course
          </button>
          <button
            type="button"
            className="friction-btn friction-btn-primary"
            onClick={() =>
              onAccept(trigger.suggestedOffset, trigger.suggestedAction)
            }
          >
            {trigger.suggestedAction === "easier"
              ? "Yes, ease up"
              : trigger.suggestedAction === "harder"
                ? "Yes, push me"
                : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
