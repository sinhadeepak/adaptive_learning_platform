// Per-exam "needs attention" cards — replaces the non-contextual QuickActions
// row on the unified dashboard. One card per enrolled exam, each deep-linking
// into that exam's practice flow. Reuses the .vidya-quick CSS family.
import { Link } from "react-router-dom";
import type { EnrolledExam, ExamSummary } from "../../lib/multiExam";

interface Props {
  exams: EnrolledExam[];
  summaries: Record<string, ExamSummary>;
  topicTitles: Record<string, string>;
}

function daysToExam(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const t = new Date(targetDate).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
}

export function ExamAttentionCards({ exams, summaries, topicTitles }: Props) {
  if (!exams.length) return null;

  return (
    <section className="vidya-quick" aria-label="Needs attention">
      <div className="vidya-quick__head">
        <span className="vidya-quick__eyebrow">Needs attention</span>
        <span className="vidya-quick__sub">
          Across your {exams.length} {exams.length === 1 ? "exam" : "exams"}.
        </span>
      </div>
      <div className="vidya-quick__grid">
        {exams.map((exam) => {
          const s = summaries[exam.examId];
          const scaled = s ? Math.round(s.readinessScore * 900) : 0;
          const dte = daysToExam(exam.targetDate);
          const weakTitle = s?.weakestTopicId
            ? topicTitles[s.weakestTopicId] ?? "—"
            : "—";
          const mistakes = s?.mistakesDue ?? 0;
          const revision = s?.revisionDue ?? 0;
          const allClear = mistakes === 0 && revision === 0;
          const href = s?.weakestTopicId
            ? `/practice?examId=${encodeURIComponent(exam.examId)}&topic=${encodeURIComponent(s.weakestTopicId)}`
            : `/practice?examId=${encodeURIComponent(exam.examId)}`;
          return (
            <div key={exam.examId} className="vidya-quick__card">
              <div className="vidya-quick__title">{exam.code}</div>
              <p className="vidya-quick__body" style={{ marginBottom: 4 }}>
                {exam.name}
              </p>
              <div className="vidya-quick__meta-row" style={{ display: "flex", gap: 12, fontSize: 13 }}>
                <span>{scaled || "—"}/900</span>
                {dte !== null && <span>{dte}d to exam</span>}
              </div>
              <p className="vidya-quick__body">
                Weakest: <strong>{weakTitle}</strong>
              </p>
              <p className="vidya-quick__body">
                {allClear ? (
                  <span style={{ color: "var(--accent)" }}>All clear ✓</span>
                ) : (
                  <>
                    {mistakes > 0 && <span>{mistakes} mistakes due</span>}
                    {mistakes > 0 && revision > 0 && <span> · </span>}
                    {revision > 0 && <span>{revision} revision due</span>}
                  </>
                )}
              </p>
              <Link
                to={href}
                className="vidya-quick__cta"
                aria-label={`Resume ${exam.code}`}
              >
                Resume →
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
