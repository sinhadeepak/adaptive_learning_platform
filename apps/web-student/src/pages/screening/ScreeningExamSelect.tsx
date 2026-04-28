import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../lib/api";
import {
  EXAM_META,
  PLANNED_CODES,
  fallbackName,
  metaFor,
  type ExamMeta,
} from "../../lib/exam-meta";
import "@alp/design-system/shell.css";

// Guest-mode AI Screening Test — Step 1 of 2 (pick your exam).
// Reachable WITHOUT a session; renders the catalog's exam list as a polished
// 3-up card grid with category pills, a "Coming soon" placeholder for exams
// not yet seeded in the catalog, and a primary CTA that auto-labels with the
// selected exam ("Start NEET screening test →").
//
// On submit we stash the picked exam in sessionStorage and route to
// /screening/quiz (Step 2). Picking up the stashed exam from /register
// or /login lets a guest who later signs up land in onboarding pre-filled.

interface Exam {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
  iconKey?: string | null;
}

interface DisplayExam {
  id: string | null; // null = coming-soon placeholder
  code: string;
  name: string;
  meta: ExamMeta;
  available: boolean;
}

export function ScreeningExamSelect() {
  const navigate = useNavigate();
  const [catalogExams, setCatalogExams] = useState<Exam[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setCatalogExams((await r.json()) as Exam[]);
      } catch {
        setError("We couldn't load the exam list. Try again in a moment.");
        setCatalogExams([]);
      }
    })();
  }, []);

  // Restore previous selection if the user came back from a later step.
  useEffect(() => {
    const stashed = sessionStorage.getItem("alp.screening.examId");
    if (stashed) setPicked(stashed);
  }, []);

  const display: DisplayExam[] = (() => {
    if (catalogExams === null) return [];
    const byCode = new Map(catalogExams.map((e) => [e.code, e]));
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
        });
      } else {
        // Design-defined slot, but not yet in the catalog → coming-soon.
        out.push({
          id: null,
          code,
          name: fallbackName(code),
          meta: { ...metaFor(code), pillLabel: "Coming soon", pillKind: "coming" },
          available: false,
        });
      }
    }
    // Surface any unseeded catalog exams that the design didn't anticipate.
    for (const e of catalogExams) {
      if (!PLANNED_CODES.includes(e.code)) {
        out.push({
          id: e.id,
          code: e.code,
          name: e.name,
          meta: EXAM_META[e.code] ?? metaFor(e.code, e.subtitle),
          available: true,
        });
      }
    }
    return out;
  })();

  const pickedExam = display.find((d) => d.id === picked) ?? null;

  function onStart() {
    if (!pickedExam || !pickedExam.id) return;
    sessionStorage.setItem("alp.screening.examId", pickedExam.id);
    sessionStorage.setItem("alp.screening.examCode", pickedExam.code);
    sessionStorage.setItem("alp.screening.examName", pickedExam.name);
    navigate("/screening/quiz");
  }

  return (
    <div className="scr-page">
      <header className="scr-bar">
        <Link to="/" className="scr-bar-mark" aria-label="AdaptiveLearn home">
          <span className="scr-bar-mark-square">A</span>
          <span>
            Adaptive<span className="scr-bar-mark-blue">Learn</span>
          </span>
        </Link>
        <span className="scr-bar-pill">◈ Free AI Screening Test</span>
        <span className="scr-bar-spacer" />
        <button
          type="button"
          className="scr-bar-back"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
        <Link to="/login" className="scr-bar-signin">
          Sign In
        </Link>
      </header>

      <main className="scr-body">
        <span className="scr-step-pill">◈ Step 1 of 2 · Select your exam</span>
        <h1 className="scr-title">Which exam are you preparing for?</h1>
        <p className="scr-sub">
          We'll show you 10 AI-curated questions specific to your exam. Takes
          ~10 minutes. No sign-up needed.
        </p>

        {error ? (
          <div
            role="alert"
            style={{
              maxWidth: 520,
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(244,63,94,0.08)",
              border: "1px solid rgba(244,63,94,0.22)",
              color: "var(--color-red)",
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        ) : null}

        <div className="scr-grid" role="radiogroup" aria-label="Exam">
          {display.map((d) => {
            const selected = d.id !== null && d.id === picked;
            return (
              <button
                key={d.code}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!d.available}
                onClick={() => d.available && d.id && setPicked(d.id)}
                className={`scr-exam-card${selected ? " scr-exam-card-selected" : ""}`}
              >
                {selected ? <span className="scr-exam-check">✓</span> : null}
                <div className="scr-exam-icon" aria-hidden>
                  {d.meta.icon}
                </div>
                <h2 className="scr-exam-name">{d.name}</h2>
                <p className="scr-exam-sub">{d.meta.subjects}</p>
                <span
                  className={`scr-exam-pill scr-exam-pill-${d.meta.pillKind}`}
                >
                  {d.meta.pillLabel}
                </span>
              </button>
            );
          })}
          {/* Final "More exams" tile — always rendered as a coming-soon placeholder. */}
          <button
            type="button"
            disabled
            className="scr-exam-card"
            aria-label="More exams coming soon"
          >
            <div className="scr-exam-icon" aria-hidden>
              ＋
            </div>
            <h2 className="scr-exam-name">More exams</h2>
            <p className="scr-exam-sub">State boards · others</p>
            <span className="scr-exam-pill scr-exam-pill-coming">
              Coming soon
            </span>
          </button>
        </div>

        <button
          type="button"
          className="scr-cta"
          disabled={!pickedExam}
          onClick={onStart}
        >
          ◈ Start {pickedExam ? pickedExam.name : ""} screening test →
        </button>
        <p className="scr-foot">
          10 questions · ~10 minutes · results shown immediately · no data
          stored without account
        </p>
      </main>
    </div>
  );
}
