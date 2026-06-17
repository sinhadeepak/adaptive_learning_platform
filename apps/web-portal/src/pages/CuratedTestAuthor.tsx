// F6 — Curated Test Author (educator portal).
// URL: /curated/new
//
// One-screen authoring form (no wizard — educators are power users and
// the curated workflow is repetitive). POSTs to /catalog/exam-blueprints/
// curated which lands the row as PENDING_REVIEW; the moderation queue
// at /curated/review approves it into the public library.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { SectionHeader } from "../components/primitives";
import { auth } from "../lib/api";

interface Exam {
  id: string;
  code: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface SectionInput {
  section_id: string;
  name: string;
  subject_id: string;
  topic_ids: string[];
  n_questions: number;
  n_minutes: number;
  difficulty_band: "easy" | "mixed" | "hard";
}

function newSection(i: number): SectionInput {
  return {
    section_id: `s${i + 1}`,
    name: "",
    subject_id: "",
    topic_ids: [],
    n_questions: 10,
    n_minutes: 15,
    difficulty_band: "mixed",
  };
}

export function CuratedTestAuthor() {
  const nav = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<string>("");
  const [subjectsByExam, setSubjectsByExam] = useState<Record<string, Subject[]>>({});
  const [name, setName] = useState<string>("");
  const [sections, setSections] = useState<SectionInput[]>([newSection(0)]);
  const [marksCorrect, setMarksCorrect] = useState<number>(4);
  const [marksNegative, setMarksNegative] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/v1/catalog/exams");
        if (r.ok) {
          const list = (await r.json()) as Exam[];
          setExams(list);
          if (list.length && !examId) setExamId(list[0].id);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (!examId || subjectsByExam[examId]) return;
    (async () => {
      try {
        const r = await fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (r.ok) {
          const list = (await r.json()) as Subject[];
          setSubjectsByExam((s) => ({ ...s, [examId]: list }));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [examId, subjectsByExam]);

  function updateSection(i: number, patch: Partial<SectionInput>) {
    setSections((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!name.trim()) {
      setError("Give the test a name.");
      return;
    }
    if (!examId) {
      setError("Pick an exam.");
      return;
    }
    for (const s of sections) {
      if (!s.subject_id) {
        setError("Every section needs a subject.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const r = await auth.fetch(`/api/v1/catalog/exam-blueprints/curated`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          exam_id: examId,
          sections,
          scoring: { correct: marksCorrect, negative: marksNegative },
          inter_section_navigation: true,
          per_section_time_locked: false,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body?.detail?.message ?? `HTTP ${r.status}`);
        return;
      }
      const body = await r.json();
      setSuccess(
        `Submitted for review — id ${body.id}. The library will list it once an admin approves it.`,
      );
      // Reset minimal state — keep exam selection.
      setName("");
      setSections([newSection(0)]);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const subjects = subjectsByExam[examId] ?? [];

  return (
    <AppShell
      title="Author a curated test"
      subtitle="Curated tests appear in the student-facing Library after an admin reviews and approves them."
      actions={
        <Link to="/curated/review" className="btn btn-ghost">
          Review queue →
        </Link>
      }
    >
      <div className="dash-section" style={{ maxWidth: 920 }}>
        {error && (
          <div style={{ padding: 12, marginBottom: 12, background: "var(--bad-soft-soft)", color: "var(--bad)", borderRadius: 8 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ padding: 12, marginBottom: 12, background: "var(--good-soft-soft)", color: "var(--good)", borderRadius: 8 }}>
            {success}
          </div>
        )}

        <SectionHeader label="Test details" />
        <div className="form-field">
          <label className="form-label">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Editor's pick: NEET Genetics warm-up"
            className="form-input"
          />
        </div>
        <div className="form-field">
          <label className="form-label">Exam</label>
          <select value={examId} onChange={(e) => setExamId(e.target.value)} className="form-input">
            {exams.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="form-field" style={{ flex: 1 }}>
            <label className="form-label">+Marks correct</label>
            <input
              type="number"
              value={marksCorrect}
              onChange={(e) => setMarksCorrect(Number(e.target.value))}
              min={1}
              max={10}
              className="form-input"
            />
          </div>
          <div className="form-field" style={{ flex: 1 }}>
            <label className="form-label">−Marks negative</label>
            <input
              type="number"
              value={marksNegative}
              onChange={(e) => setMarksNegative(Number(e.target.value))}
              min={0}
              max={4}
              step="0.25"
              className="form-input"
            />
          </div>
        </div>

        <SectionHeader label="Sections" count={sections.length} />
        {sections.map((s, i) => (
          <div key={s.section_id} style={{ borderTop: i > 0 ? "1px dashed var(--rule)" : "none", paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={s.name}
                onChange={(e) => updateSection(i, { name: e.target.value })}
                placeholder={`Section ${i + 1} name`}
                className="form-input"
                style={{ flex: 1 }}
              />
              <select
                value={s.subject_id}
                onChange={(e) => updateSection(i, { subject_id: e.target.value })}
                className="form-input"
                style={{ minWidth: 180 }}
              >
                <option value="">Pick subject…</option>
                {subjects.map((sj) => (
                  <option key={sj.id} value={sj.id}>{sj.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSections((arr) => arr.filter((_, j) => j !== i))}
                disabled={sections.length === 1}
                className="btn btn-ghost"
              >
                ✕
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="form-field" style={{ flex: 1 }}>
                <label className="form-label">Questions</label>
                <input
                  type="number"
                  value={s.n_questions}
                  onChange={(e) => updateSection(i, { n_questions: Math.max(1, Number(e.target.value)) })}
                  min={1}
                  max={50}
                  className="form-input"
                />
              </div>
              <div className="form-field" style={{ flex: 1 }}>
                <label className="form-label">Minutes</label>
                <input
                  type="number"
                  value={s.n_minutes}
                  onChange={(e) => updateSection(i, { n_minutes: Math.max(1, Number(e.target.value)) })}
                  min={1}
                  max={180}
                  className="form-input"
                />
              </div>
              <div className="form-field" style={{ flex: 1 }}>
                <label className="form-label">Difficulty</label>
                <select
                  value={s.difficulty_band}
                  onChange={(e) => updateSection(i, { difficulty_band: e.target.value as SectionInput["difficulty_band"] })}
                  className="form-input"
                >
                  <option value="easy">Easy-heavy</option>
                  <option value="mixed">Mixed</option>
                  <option value="hard">Hard-heavy</option>
                </select>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSections((arr) => [...arr, newSection(arr.length)])}
          disabled={sections.length >= 10}
          className="btn btn-ghost"
          style={{ marginTop: 12 }}
        >
          + Add section
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
          <button type="button" onClick={() => nav("/dashboard")} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="btn btn-primary"
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}