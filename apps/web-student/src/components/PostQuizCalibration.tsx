// PostQuizCalibration — end-of-session difficulty feedback (P6 S54).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S54
// ADR:  docs/adr/0022-difficulty-agency.md
//
// Renders on QuizResult.tsx. The student picks one of three buckets
// for how the difficulty felt; the value lands in the session's
// `calibration_feedback` column (Quiz Go migration 010). For v0 the
// caller decides where to PUT/PATCH the value; this widget owns the
// UI, the localStorage echo, and the success state.

import { useState } from "react";

export type CalibrationFeedback = "too_easy" | "right" | "too_hard";

export interface PostQuizCalibrationProps {
  sessionId: string;
  /**
   * Called when the student picks a bucket. Caller is responsible for
   * the wire call (PATCH /quiz/sessions/{id} or similar). Errors
   * thrown from this callback flip the widget into an error state.
   */
  onSubmit: (feedback: CalibrationFeedback) => Promise<void> | void;
  /**
   * Optional initial value if the user already calibrated this session
   * (e.g. the result page re-opened later).
   */
  initialValue?: CalibrationFeedback | null;
}

const OPTIONS: Array<{
  value: CalibrationFeedback;
  glyph: string;
  label: string;
  copy: string;
}> = [
  {
    value: "too_easy",
    glyph: "↓",
    label: "Too easy",
    copy: "Bias the next session harder.",
  },
  {
    value: "right",
    glyph: "=",
    label: "Just right",
    copy: "Keep the engine where it is.",
  },
  {
    value: "too_hard",
    glyph: "↑",
    label: "Too hard",
    copy: "Bias the next session easier.",
  },
];

export function PostQuizCalibration({
  onSubmit,
  initialValue = null,
}: PostQuizCalibrationProps) {
  const [pending, setPending] = useState<CalibrationFeedback | null>(
    initialValue,
  );
  const [submitted, setSubmitted] = useState<CalibrationFeedback | null>(
    initialValue,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePick(value: CalibrationFeedback) {
    if (submitting) return;
    setPending(value);
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(value);
      setSubmitted(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="calibration-card"
      aria-label="Post-session calibration"
    >
      <header className="calibration-head">
        <span className="calibration-glyph" aria-hidden>
          ◈
        </span>
        <div>
          <h3 className="calibration-title">How did that feel?</h3>
          <p className="calibration-sub">
            Tells the engine whether to bias the next session up or down.
            Your mastery numbers don't change either way.
          </p>
        </div>
      </header>
      <div
        className="calibration-options"
        role="radiogroup"
        aria-label="Difficulty calibration"
      >
        {OPTIONS.map((opt) => {
          const isActive = pending === opt.value;
          const isSubmitted = submitted === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`calibration-btn${isActive ? " is-active" : ""}${isSubmitted ? " is-submitted" : ""}`}
              onClick={() => handlePick(opt.value)}
              disabled={submitting}
            >
              <span className="calibration-btn-glyph" aria-hidden>
                {opt.glyph}
              </span>
              <span className="calibration-btn-label">{opt.label}</span>
              <span className="calibration-btn-copy">{opt.copy}</span>
            </button>
          );
        })}
      </div>
      {submitted && !error && (
        <div className="calibration-ok" role="status">
          ✓ Saved — your next session will reflect this.
        </div>
      )}
      {error && (
        <div className="calibration-err" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
