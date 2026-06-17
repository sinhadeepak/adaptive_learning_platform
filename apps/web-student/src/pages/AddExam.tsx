// AddExam — Vidya v1 redesign of the "+ Add exam / course" surface.
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 mockup set (the sidebar + Add affordance).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Reachable from VidyaShell's Learn-group "Add exam / course"
// affordance and from any direct /exams/add link. Saves through
// the existing PUT /api/v1/profile/exams endpoint and returns to
// /home so the new exam shows up in the sidebar immediately.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { VidyaShell } from "../components/vidya/VidyaShell";
import {
  EXAM_META,
  PLANNED_CODES,
  fallbackName,
  metaFor,
  type ExamMeta,
} from "../lib/exam-meta";

interface Exam {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
}

interface Profile {
  exams?: Array<{ examId: string; targetDate: string | null }> | null;
}

interface DisplayExam {
  id: string | null; // null = coming-soon placeholder
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
    let alive = true;
    (async () => {
      try {
        const [examsRes, profRes] = await Promise.all([
          auth.fetch("/api/v1/catalog/exams"),
          auth.fetch("/api/v1/profile/me"),
        ]);
        if (!alive) return;
        if (!examsRes.ok) throw new Error(`HTTP ${examsRes.status}`);
        const examsBody = (await examsRes.json()) as Exam[] | { exams?: Exam[] | null };
        // Catalog returns either a bare array or {exams: [...]} —
        // tolerate both shapes.
        const list = Array.isArray(examsBody)
          ? examsBody
          : Array.isArray(examsBody.exams)
            ? examsBody.exams
            : [];
        setExams(list);
        if (profRes.ok) {
          const prof = (await profRes.json()) as Profile;
          const enrolled = Array.isArray(prof.exams) ? prof.exams : [];
          setAlreadySelected(new Set(enrolled.map((e) => e.examId)));
        }
      } catch {
        if (alive) setError("We couldn't load the exam list. Try again.");
      }
    })();
    return () => {
      alive = false;
    };
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
    <VidyaShell
      crumbs="Add exam"
      title="Add an exam or course."
      subtitle="Pick another exam to track. Readiness, streaks, and your study plan stay intact for exams you've already added."
      actions={
        <Link to="/home" className="vidya-shell__chip">
          ← Cancel
        </Link>
      }
    >
      {error ? (
        <div className="vidya-auth__error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {exams === null ? (
        <p style={{ color: "var(--ink-3)", padding: "var(--sp-8) 0", textAlign: "center" }}>
          Loading exam catalog…
        </p>
      ) : (
        <section
          className="vidya-exam-grid"
          role="radiogroup"
          aria-label="Exam"
        >
          {display.map((d) => {
            const selected = d.id !== null && d.id === picked;
            const disabled = !d.available || d.alreadyAdded;
            const className =
              "vidya-exam-card" +
              (selected ? " vidya-exam-card--selected" : "") +
              (disabled ? " vidya-exam-card--disabled" : "");
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
                {selected ? (
                  <span className="vidya-exam-card__check" aria-hidden>
                    ✓
                  </span>
                ) : null}
                <div className="vidya-exam-card__icon" aria-hidden>
                  {d.meta.icon}
                </div>
                <h2 className="vidya-exam-card__name">{d.name}</h2>
                <p className="vidya-exam-card__sub">{d.meta.subjects}</p>
                {d.alreadyAdded ? (
                  <span className="vidya-exam-card__pill vidya-exam-card__pill--mute">
                    Already added
                  </span>
                ) : !d.available ? (
                  <span className="vidya-exam-card__pill vidya-exam-card__pill--mute">
                    Coming soon
                  </span>
                ) : (
                  <span
                    className={`vidya-exam-card__pill vidya-exam-card__pill--${pillTone(d.meta.pillKind)}`}
                  >
                    {d.meta.pillLabel}
                  </span>
                )}
              </button>
            );
          })}
        </section>
      )}

      <div className="vidya-exam-actions">
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="vidya-shell__chip"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!pickedExam || submitting}
          className="vidya-shell__primary"
        >
          {submitting
            ? "Adding…"
            : pickedExam
              ? `+ Add ${pickedExam.name}`
              : "+ Add exam"}
        </button>
      </div>
    </VidyaShell>
  );
}

/** Map exam-meta pill kinds to Vidya semantic tones. */
function pillTone(kind: string): "good" | "warn" | "accent" | "ai" | "mute" {
  switch (kind) {
    case "available":
      return "good";
    case "category":
      return "accent";
    case "civil":
      return "ai";
    case "mba":
      return "warn";
    case "coming":
      return "mute";
    default:
      return "mute";
  }
}
