// F6 — Curated Test Author (educator portal).
// URL: /curated/new
//
// One-screen authoring form (no wizard — educators are power users and
// the curated workflow is repetitive). POSTs to /catalog/exam-blueprints/
// curated which lands the row as PENDING_REVIEW; the moderation queue
// at /curated/review approves it into the public library.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Author a curated test</h1>
          <p style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 13 }}>
            Curated tests appear in the student-facing Library after an
            admin reviews and approves them.
          </p>
        </div>
        <Link to="/curated/review" style={{ fontSize: 13 }}>
          Review queue →
        </Link>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 12, background: "var(--bg-danger-soft)", color: "var(--text-danger)", borderRadius: 8 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: 12, marginBottom: 12, background: "var(--bg-success-soft)", color: "var(--text-success)", borderRadius: 8 }}>
          {success}
        </div>
      )}

      <fieldset style={{ border: "1px solid var(--border-subtle)", padding: 16, borderRadius: 8, marginBottom: 16 }}>
        <legend>Test details</legend>
        <label style={{ display: "block", marginBottom: 8 }}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Editor's pick: NEET Genetics warm-up"
            style={{ width: "100%", padding: 8, fontSize: 14 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          Exam
          <select value={examId} onChange={(e) => setExamId(e.target.value)} style={{ width: "100%", padding: 8 }}>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ flex: 1 }}>
            +Marks correct
            <input
              type="number"
              value={marksCorrect}
              onChange={(e) => setMarksCorrect(Number(e.target.value))}
              min={1}
              max={10}
              style={{ width: "100%", padding: 8 }}
            />
          </label>
          <label style={{ flex: 1 }}>
            −Marks negative
            <input
              type="number"
              value={marksNegative}
              onChange={(e) => setMarksNegative(Number(e.target.value))}
              min={0}
              max={4}
              step="0.25"
              style={{ width: "100%", padding: 8 }}
            />
          </label>
        </div>
      </fieldset>

      <fieldset style={{ border: "1px solid var(--border-subtle)", padding: 16, borderRadius: 8, marginBottom: 16 }}>
        <legend>Sections ({sections.length})</legend>
        {sections.map((s, i) => (
          <div key={s.section_id} style={{ borderTop: i > 0 ? "1px dashed var(--border-subtle)" : "none", paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={s.name}
                onChange={(e) => updateSection(i, { name: e.target.value })}
                placeholder={`Section ${i + 1} name`}
                style={{ flex: 1, padding: 6 }}
              />
              <select
                value={s.subject_id}
                onChange={(e) => updateSection(i, { subject_id: e.target.value })}
                style={{ padding: 6, minWidth: 180 }}
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
                style={{ padding: "4px 10px" }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, fontSize: 12 }}>
                Questions
                <input
                  type="number"
                  value={s.n_questions}
                  onChange={(e) => updateSection(i, { n_questions: Math.max(1, Number(e.target.value)) })}
                  min={1}
                  max={50}
                  style={{ width: "100%", padding: 6 }}
                />
              </label>
              <label style={{ flex: 1, fontSize: 12 }}>
                Minutes
                <input
                  type="number"
                  value={s.n_minutes}
                  onChange={(e) => updateSection(i, { n_minutes: Math.max(1, Number(e.target.value)) })}
                  min={1}
                  max={180}
                  style={{ width: "100%", padding: 6 }}
                />
              </label>
              <label style={{ flex: 1, fontSize: 12 }}>
                Difficulty
                <select
                  value={s.difficulty_band}
                  onChange={(e) => updateSection(i, { difficulty_band: e.target.value as SectionInput["difficulty_band"] })}
                  style={{ width: "100%", padding: 6 }}
                >
                  <option value="easy">Easy-heavy</option>
                  <option value="mixed">Mixed</option>
                  <option value="hard">Hard-heavy</option>
                </select>
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSections((arr) => [...arr, newSection(arr.length)])}
          disabled={sections.length >= 10}
          style={{ marginTop: 12, padding: "6px 12px" }}
        >
          + Add section
        </button>
      </fieldset>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" onClick={() => nav("/dashboard")} style={{ padding: "8px 14px" }}>
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          style={{ padding: "10px 18px", background: "var(--color-blue)", color: "#fff", borderRadius: 8 }}
        >
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
      </div>
    </div>
  );
}
