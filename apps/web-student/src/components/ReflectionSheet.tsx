// ReflectionSheet — post-session reflection + commitment (P6 S57 UX-27).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S57
//
// Slides up after a quiz/mock or at the end of a weekly review.
// Two-step flow:
//   1. Reflect — free-form "what worked / what didn't" textarea
//   2. Commit  — short imperative + optional due date
// Caller wires onSubmit to POST /reflections.

import { useEffect, useState } from "react";

import type { ReflectionTrigger } from "../lib/reflection";

export interface ReflectionSheetProps {
  open: boolean;
  trigger: ReflectionTrigger;
  triggerArtifactId?: string;
  onClose: () => void;
  onSubmit: (payload: {
    response: string;
    commitment: string | null;
    commitmentDueAt: string | null;
  }) => Promise<void> | void;
}

const TRIGGER_COPY: Record<ReflectionTrigger, { eyebrow: string; prompt: string }> = {
  session: {
    eyebrow: "Reflect — practice session",
    prompt:
      "One thing that worked, one thing that tripped you up. Two sentences max.",
  },
  mock: {
    eyebrow: "Reflect — mock test",
    prompt:
      "Where did time pressure bite, where did you feel in flow? Honest, terse.",
  },
  weekly: {
    eyebrow: "Reflect — your week",
    prompt:
      "What's the one signal from this week that should change next week?",
  },
};

export function ReflectionSheet({
  open,
  trigger,
  onClose,
  onSubmit,
}: ReflectionSheetProps) {
  const [stage, setStage] = useState<"reflect" | "commit">("reflect");
  const [response, setResponse] = useState("");
  const [commitment, setCommitment] = useState("");
  const [commitmentDate, setCommitmentDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset when re-opened.
  useEffect(() => {
    if (open) {
      setStage("reflect");
      setResponse("");
      setCommitment("");
      setCommitmentDate("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;
  const copy = TRIGGER_COPY[trigger];

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        response: response.trim(),
        commitment: commitment.trim() || null,
        commitmentDueAt: commitmentDate ? new Date(commitmentDate).toISOString() : null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save reflection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="reflection-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reflection-eyebrow"
      onClick={onClose}
    >
      <div
        className="reflection-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="reflection-eyebrow" className="reflection-eyebrow">
          ◈ {copy.eyebrow}
        </div>

        {stage === "reflect" && (
          <>
            <h2 className="reflection-title">{copy.prompt}</h2>
            <textarea
              className="reflection-textarea"
              placeholder="Two sentences. Honest beats polished."
              rows={4}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              maxLength={2000}
            />
            <div className="reflection-actions">
              <button
                type="button"
                className="reflection-btn"
                onClick={onClose}
              >
                Skip
              </button>
              <button
                type="button"
                className="reflection-btn reflection-btn-primary"
                onClick={() => setStage("commit")}
                disabled={response.trim().length === 0}
              >
                Next · commit →
              </button>
            </div>
          </>
        )}

        {stage === "commit" && (
          <>
            <h2 className="reflection-title">
              One thing you'll actually do
            </h2>
            <p className="reflection-sub">
              Short, imperative, time-boxed. We'll check back in.
            </p>
            <input
              type="text"
              className="reflection-input"
              placeholder="e.g. Drill Newton 3 for 20 minutes tomorrow morning"
              value={commitment}
              onChange={(e) => setCommitment(e.target.value)}
              maxLength={400}
            />
            <label className="reflection-due-label">
              <span>Due by</span>
              <input
                type="date"
                className="reflection-date-input"
                value={commitmentDate}
                onChange={(e) => setCommitmentDate(e.target.value)}
              />
            </label>
            {error && <div className="reflection-err">{error}</div>}
            <div className="reflection-actions">
              <button
                type="button"
                className="reflection-btn"
                onClick={() => setStage("reflect")}
                disabled={submitting}
              >
                ← Back
              </button>
              <button
                type="button"
                className="reflection-btn reflection-btn-primary"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Save commitment"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
