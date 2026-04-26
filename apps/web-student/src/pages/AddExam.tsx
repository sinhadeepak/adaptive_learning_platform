import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/dashboard";

// ─────────────────────────────────────────────────────────────────────
// Add Exam — entered from the home dashboard's "+ Add exam" link.
// ProtectedRoute already bounces ONBOARDED users away from /onboarding/*,
// so this is a parallel surface that uses the same PUT /profile/exams
// endpoint without dragging the user back through language / target-date /
// daily-goal steps. Returns to /home on save.
// ─────────────────────────────────────────────────────────────────────

interface Exam {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
  iconKey?: string | null;
}

interface Profile {
  exams: Array<{ examId: string; targetDate: string | null }>;
}

export function AddExam() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [alreadySelected, setAlreadySelected] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [examsRes, profRes] = await Promise.all([
          auth.fetch("/api/v1/catalog/exams"),
          auth.fetch("/api/v1/profile/me"),
        ]);
        if (!examsRes.ok) throw new Error(`HTTP ${examsRes.status}`);
        setExams((await examsRes.json()) as Exam[]);
        if (profRes.ok) {
          const prof = (await profRes.json()) as Profile;
          setAlreadySelected(new Set(prof.exams.map((e) => e.examId)));
        }
      } catch {
        setError("We couldn't load the exam list. Try again.");
      }
    })();
  }, []);

  async function onSave() {
    if (!picked) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await auth.fetch("/api/v1/profile/exams", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ examId: picked }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      navigate("/home", { replace: true });
    } catch {
      setError("We couldn't save your selection. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Add an exam"
      actions={
        <Link to="/home" className="btn btn-ghost">
          ← Cancel
        </Link>
      }
    >
      <p className="page-subhead">
        Pick another exam to track. Your readiness, streaks, and study plan stay
        intact for the exams you've already added.
      </p>

      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {exams === null ? (
        <SkeletonRows count={4} />
      ) : (
        <div role="radiogroup" aria-label="Exam" className="option-list">
          {exams.map((exam) => {
            const isSelected = picked === exam.id;
            const isAlready = alreadySelected.has(exam.id);
            return (
              <button
                key={exam.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={isAlready}
                onClick={() => !isAlready && setPicked(exam.id)}
                className={`option-card ${isSelected ? "option-card-selected" : ""} ${isAlready ? "option-card-disabled" : ""}`.trim()}
                style={
                  isAlready
                    ? { opacity: 0.5, cursor: "not-allowed" }
                    : undefined
                }
              >
                <div className="option-card-head">
                  <span className="option-card-title">{exam.name}</span>
                  {isAlready ? (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      already added
                    </span>
                  ) : isSelected ? (
                    <span className="option-check">✓</span>
                  ) : null}
                </div>
                {exam.subtitle ? (
                  <p className="option-card-sub">{exam.subtitle}</p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: "var(--sp-5)", display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!picked || submitting}
          className="btn btn-primary"
        >
          {submitting ? "Saving…" : "Add exam"}
        </button>
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="btn btn-ghost"
        >
          Cancel
        </button>
      </div>
    </AppShell>
  );
}
