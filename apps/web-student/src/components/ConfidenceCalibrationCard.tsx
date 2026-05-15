// ConfidenceCalibrationCard — UX-30 confidence calibration (P6 S58).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S58
//
// Pure presentational widget that shows the student's calibration
// curve over their recent attempts. Three buckets:
//   - aligned      : abs(confidence − accuracy) < 10%
//   - overconfident: confidence > accuracy + 10%
//   - underconfident: confidence < accuracy − 10%
//
// Caller passes the rolled-up rows; for v0 we don't fetch — the
// Insights hub already has the multi-profile endpoint, this widget
// just renders.

export interface CalibrationRow {
  /** Concept or topic id — caller-supplied for the row label fallback. */
  key: string;
  /** Optional display name; falls back to the id slice. */
  label?: string;
  /** Student's average confidence in [0, 1]. */
  confidence: number;
  /** Student's actual accuracy in [0, 1]. */
  accuracy: number;
  /** Sample size for the row. */
  n: number;
}

export type CalibrationBucket =
  | "aligned"
  | "overconfident"
  | "underconfident";

export interface ConfidenceCalibrationCardProps {
  rows: CalibrationRow[];
  /** When true, hides the empty state and renders nothing instead. */
  hideWhenEmpty?: boolean;
}

export function bucketFor(row: CalibrationRow): CalibrationBucket {
  const delta = row.confidence - row.accuracy;
  if (Math.abs(delta) < 0.1) return "aligned";
  return delta > 0 ? "overconfident" : "underconfident";
}

const BUCKET_COPY: Record<CalibrationBucket, { label: string; tone: string }> = {
  aligned: { label: "Aligned", tone: "success" },
  overconfident: { label: "Overconfident", tone: "danger" },
  underconfident: { label: "Underconfident", tone: "warning" },
};

export function ConfidenceCalibrationCard({
  rows,
  hideWhenEmpty = false,
}: ConfidenceCalibrationCardProps) {
  if (rows.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <section className="cal-card" aria-label="Confidence calibration">
        <header className="cal-head">
          <span className="cal-glyph" aria-hidden>
            ⚖
          </span>
          <h3 className="cal-title">Confidence vs. accuracy</h3>
        </header>
        <p className="cal-empty">
          Rate your confidence on a few practice items and we'll start
          plotting your calibration here.
        </p>
      </section>
    );
  }

  // Compute overall calibration: mean signed gap (confidence − accuracy).
  const meanGap =
    rows.reduce((acc, r) => acc + (r.confidence - r.accuracy), 0) /
    rows.length;
  const overallBucket: CalibrationBucket =
    Math.abs(meanGap) < 0.05
      ? "aligned"
      : meanGap > 0
        ? "overconfident"
        : "underconfident";

  return (
    <section
      className="cal-card"
      aria-label="Confidence calibration"
    >
      <header className="cal-head">
        <span className="cal-glyph" aria-hidden>
          ⚖
        </span>
        <div>
          <h3 className="cal-title">Confidence vs. accuracy</h3>
          <p className="cal-sub">
            On average you're <strong>{BUCKET_COPY[overallBucket].label.toLowerCase()}</strong>
            {" "}by {(Math.abs(meanGap) * 100).toFixed(0)}%.
          </p>
        </div>
      </header>
      <ul className="cal-rows">
        {rows.slice(0, 6).map((r) => {
          const b = bucketFor(r);
          const copy = BUCKET_COPY[b];
          const confPct = Math.round(r.confidence * 100);
          const accPct = Math.round(r.accuracy * 100);
          return (
            <li key={r.key} className={`cal-row cal-row-${copy.tone}`}>
              <div className="cal-row-name">{r.label ?? r.key.slice(0, 8)}</div>
              <div className="cal-row-meta">
                <span className="cal-conf">conf {confPct}%</span>
                <span aria-hidden>·</span>
                <span className="cal-acc">acc {accPct}%</span>
                <span aria-hidden>·</span>
                <span className="cal-n">n={r.n}</span>
              </div>
              <div className={`cal-bucket cal-bucket-${copy.tone}`}>
                {copy.label}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
