import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/dashboard";
import {
  EXAM_META,
  PLANNED_CODES,
  fallbackName,
  metaFor,
  type ExamMeta,
} from "../lib/exam-meta";

// Add Exam — entered from the home dashboard's "+ Add exam" link.
// Shares the polished `.scr-exam-card` grid with the guest /screening
// picker so the two surfaces feel like the same component (icons,
// category pill, cyan-bordered selected state).
//
// ProtectedRoute already bounces ONBOARDED users away from /onboarding/*,
// so this is a parallel surface that uses the same PUT /profile/exams
// endpoint without dragging the user back through language /
// target-date / daily-goal steps. Returns to /home on save.

interface Exam {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
}

interface Profile {
  exams: Array<{ examId: string; targetDate: string | null }>;
}

interface DisplayExam {
  id: string | null;          // null = coming-soon placeholder
  code: string;
  name: string;
  meta: ExamMeta;
  available: boolean;
  alreadyAdded: boolean;
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

  const display = useMemo<DisplayExam[]>(() => {
    if (!exams) return [];
    const byCode = new Map(exams.map((e) => [e.code, e]));
    const out: DisplayExam[] = [];
    for (const code of PLANNED_CODES) {
      const exam = byCode.get(code);
      if (exam) {
        out.push({
          id: exam.id,
          code: exam.code,
          name: exam.name,
          meta: metaFor(code, exam.subtitle),
          available: true,
          alreadyAdded: alreadySelected.has(exam.id),
        });
      } else {
        out.push({
          id: null,
          code,
          name: fallbackName(code),
          meta: { ...metaFor(code), pillLabel: "Coming soon", pillKind: "coming" },
          available: false,
          alreadyAdded: false,
        });
      }
    }
    for (const e of exams) {
      if (!PLANNED_CODES.includes(e.code)) {
        out.push({
          id: e.id,
          code: e.code,
          name: e.name,
          meta: EXAM_META[e.code] ?? metaFor(e.code, e.subtitle),
          available: true,
          alreadyAdded: alreadySelected.has(e.id),
        });
      }
    }
    return out;
  }, [exams, alreadySelected]);

  const pickedExam = display.find((d) => d.id === picked) ?? null;

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
        <Link to="/home" className="topbar-back">
          ← Cancel
        </Link>
      }
    >
      <p className="page-subhead">
        Pick another exam to track. Your readiness, streaks, and study plan
        stay intact for the exams you've already added.
      </p>

      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {exams === null ? (
        <SkeletonRows count={4} />
      ) : (
        <div className="scr-grid" role="radiogroup" aria-label="Exam">
          {display.map((d) => {
            const selected = d.id !== null && d.id === picked;
            const disabled = !d.available || d.alreadyAdded;
            const className =
              "scr-exam-card" + (selected ? " scr-exam-card-selected" : "");
            return (
              <button
                key={d.code}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => !disabled && d.id && setPicked(d.id)}
                className={className}
              >
                {selected ? <span className="scr-exam-check">✓</span> : null}
                <div className="scr-exam-icon" aria-hidden>
                  {d.meta.icon}
                </div>
                <h2 className="scr-exam-name">{d.name}</h2>
                <p className="scr-exam-sub">{d.meta.subjects}</p>
                {d.alreadyAdded ? (
                  <span className="scr-exam-pill scr-exam-pill-coming">
                    Already added
                  </span>
                ) : (
                  <span
                    className={`scr-exam-pill scr-exam-pill-${d.meta.pillKind}`}
                  >
                    {d.meta.pillLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div
        style={{
          marginTop: "var(--sp-5)",
          display: "flex",
          gap: 8,
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!pickedExam || submitting}
          className="scr-cta"
        >
          {submitting ? "Adding…" : pickedExam ? `+ Add ${pickedExam.name}` : "+ Add exam"}
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
