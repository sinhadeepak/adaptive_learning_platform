// Per-exam readiness hero. One slide per enrolled exam; manual navigation
// (dots + prev/next), no auto-rotate — a readiness number is read, not
// glanced. Reuses the existing .vidya-hero CSS family for a single slide.
import { useEffect, useState } from "react";
import type { EnrolledExam, ExamSummary } from "../../lib/multiExam";

interface Props {
  exams: EnrolledExam[];
  summaries: Record<string, ExamSummary>;
}

function daysToExam(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const t = new Date(targetDate).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
}

export function ReadinessCarousel({ exams, summaries }: Props) {
  const [idx, setIdx] = useState(0);
  // Clamp when the exam list shrinks (defensive; list is stable in practice).
  useEffect(() => {
    if (idx > exams.length - 1) setIdx(0);
  }, [exams.length, idx]);

  if (!exams.length) {
    return (
      <section className="vidya-hero" aria-labelledby="hero-readiness">
        <p className="vidya-hero__eyebrow" id="hero-readiness">
          Readiness · AI estimate
        </p>
        <div className="vidya-hero__number">—</div>
        <p className="vidya-hero__caption" style={{ marginTop: "var(--sp-4)" }}>
          Practice 10 more questions to see your readiness.
        </p>
      </section>
    );
  }

  const exam = exams[Math.min(idx, exams.length - 1)];
  const s = summaries[exam.examId];
  const scaled = s ? Math.round(s.readinessScore * 900) : 0;
  const dte = daysToExam(exam.targetDate);
  const prev = () => setIdx((i) => (i - 1 + exams.length) % exams.length);
  const next = () => setIdx((i) => (i + 1) % exams.length);

  return (
    <section className="vidya-hero" aria-labelledby="hero-readiness">
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <p className="vidya-hero__eyebrow" id="hero-readiness">
          {exam.code} Readiness · AI estimate
        </p>
        {exams.length > 1 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              aria-label="Previous exam"
              className="vidya-hero__nav"
              onClick={prev}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next exam"
              className="vidya-hero__nav"
              onClick={next}
            >
              ›
            </button>
          </div>
        )}
      </div>
      <div className="vidya-hero__number">
        {scaled || "—"}
        <span className="vidya-hero__number-unit">/ 900</span>
      </div>
      <div className="vidya-hero__meta-row">
        <span className="vidya-hero__theta">{s?.nTopics ?? 0} topics tracked</span>
        {dte !== null && (
          <span className="vidya-hero__delta">{dte} days to exam</span>
        )}
      </div>
      {exams.length > 1 && (
        <div
          className="vidya-hero__dots"
          role="tablist"
          aria-label="Exam readiness slides"
          style={{ display: "flex", gap: 6, marginTop: "var(--sp-4)" }}
        >
          {exams.map((e, i) => (
            <button
              key={e.examId}
              type="button"
              role="tab"
              aria-selected={i === idx}
              aria-label={`${e.code} readiness`}
              onClick={() => setIdx(i)}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                background: i === idx ? "var(--paper)" : "var(--ink-3)",
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
