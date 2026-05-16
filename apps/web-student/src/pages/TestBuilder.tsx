// F3 — Custom Test Builder.
//
// 4-step wizard:
//   1. Scope     — exam + test name
//   2. Sections  — 1-10 sections, each: subject → topics → count + minutes + difficulty
//   3. Rules     — marks correct/negative, inter-section nav, per-section lock
//   4. Review    — summary + Save & start / Save without starting
//
// Backend flow: POST /api/v1/catalog/exam-blueprints/custom returns
// { id } → the launch flow calls /quiz/sessions/start-from-blueprint
// with that id, mirroring how the existing Mock Exam works.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";

// Local catalog typings — web-student doesn't ship a `catalog.*`
// helper module today; everywhere else in the codebase uses raw
// auth.fetch against /api/v1/catalog/*. We mirror that pattern.
interface CatalogExam {
  id: string;
  name: string;
  code?: string;
}
interface CatalogSubject {
  id: string;
  name: string;
}
interface CatalogTopic {
  id: string;
  title: string;
}

type Difficulty = "easy" | "mixed" | "hard";

interface Section {
  id: string;
  name: string;
  subjectId: string;
  topicIds: string[];
  nQuestions: number;
  nMinutes: number;
  difficulty: Difficulty;
}

interface Scoring {
  correct: number;
  negative: number;
}

const STEPS = ["Scope", "Sections", "Rules", "Review"] as const;
type Step = 1 | 2 | 3 | 4;

function genSectionId(): string {
  return `s_${Math.random().toString(36).slice(2, 8)}`;
}

function newSection(): Section {
  return {
    id: genSectionId(),
    name: "",
    subjectId: "",
    topicIds: [],
    nQuestions: 10,
    nMinutes: 15,
    difficulty: "mixed",
  };
}

export function TestBuilder() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // Step 1 — scope
  const [name, setName] = useState<string>("");
  const [examId, setExamId] = useState<string>("");
  const [exams, setExams] = useState<CatalogExam[]>([]);

  // Step 2 — sections
  const [sections, setSections] = useState<Section[]>([newSection()]);
  const [subjectsByExam, setSubjectsByExam] = useState<Record<string, CatalogSubject[]>>({});
  const [topicsBySubject, setTopicsBySubject] = useState<Record<string, CatalogTopic[]>>({});

  // Step 3 — rules
  const [scoring, setScoring] = useState<Scoring>({ correct: 4, negative: 1 });
  const [interSectionNav, setInterSectionNav] = useState(true);
  const [perSectionLock, setPerSectionLock] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (!r.ok) {
          if (alive) setExams([]);
          return;
        }
        const list = (await r.json()) as CatalogExam[];
        if (!alive) return;
        setExams(list);
        if (list.length > 0 && !examId) setExamId(list[0].id);
      } catch {
        if (alive) setExams([]);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!examId || subjectsByExam[examId]) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (!r.ok) {
          setSubjectsByExam((p) => ({ ...p, [examId]: [] }));
          return;
        }
        const list = (await r.json()) as CatalogSubject[];
        setSubjectsByExam((p) => ({ ...p, [examId]: list }));
      } catch {
        setSubjectsByExam((p) => ({ ...p, [examId]: [] }));
      }
    })();
  }, [examId, subjectsByExam]);

  async function ensureTopics(subjectId: string) {
    if (!subjectId || topicsBySubject[subjectId]) return;
    try {
      const r = await auth.fetch(`/api/v1/catalog/subjects/${subjectId}/topics`);
      if (!r.ok) {
        setTopicsBySubject((p) => ({ ...p, [subjectId]: [] }));
        return;
      }
      const list = (await r.json()) as CatalogTopic[];
      setTopicsBySubject((p) => ({ ...p, [subjectId]: list }));
    } catch {
      setTopicsBySubject((p) => ({ ...p, [subjectId]: [] }));
    }
  }

  const totalQuestions = useMemo(
    () => sections.reduce((a, s) => a + s.nQuestions, 0),
    [sections],
  );
  const totalMinutes = useMemo(
    () => sections.reduce((a, s) => a + s.nMinutes, 0),
    [sections],
  );

  const canAdvance: Record<Step, boolean> = {
    1: !!examId && name.trim().length > 0,
    2: sections.length > 0 && sections.every((s) => s.subjectId && s.nQuestions > 0 && s.nMinutes > 0),
    3: scoring.correct > 0 && scoring.negative >= 0,
    4: true,
  };

  function updateSection(i: number, patch: Partial<Section>) {
    setSections((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function toggleTopic(i: number, topicId: string) {
    setSections((prev) => {
      const next = [...prev];
      const cur = next[i];
      const have = new Set(cur.topicIds);
      if (have.has(topicId)) have.delete(topicId);
      else have.add(topicId);
      next[i] = { ...cur, topicIds: Array.from(have) };
      return next;
    });
  }

  async function save(startAfter: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        exam_id: examId,
        sections: sections.map((s, idx) => ({
          section_id: s.id,
          name: s.name.trim() || `Section ${idx + 1}`,
          subject_id: s.subjectId,
          topic_ids: s.topicIds,
          n_questions: s.nQuestions,
          n_minutes: s.nMinutes,
          difficulty_band: s.difficulty,
        })),
        scoring: { correct: scoring.correct, negative: scoring.negative },
        inter_section_navigation: interSectionNav,
        per_section_time_locked: perSectionLock,
      };
      const r = await auth.fetch(`/api/v1/catalog/exam-blueprints/custom`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const txt = await r.text();
        setError(`Couldn't save test (${r.status}): ${txt.slice(0, 200)}`);
        return;
      }
      const created = (await r.json()) as { id: string };
      if (startAfter) {
        // Reuse the existing MockExam runner — it already accepts a
        // blueprintId query param and handles compose + play + score.
        nav(`/mock-exam?blueprintId=${created.id}`, { replace: true });
      } else {
        nav(`/practice/my-tests`, { replace: true });
      }
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const subjectsForCurrent = subjectsByExam[examId] ?? [];

  return (
    <AppShell
      title="Build a custom test"
      actions={
        <Link to="/practice" className="pg-btn pg-btn-ghost">
          Cancel
        </Link>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 1080 }}>
        <Stepper step={step} />

        {error && <Banner tone="danger">{error}</Banner>}

        {step === 1 && (
          <section className="pg-section">
            <h2 className="pg-section-title">
              1. Scope
              <span className="pg-section-title-sub">exam + name</span>
            </h2>
            <div className="pg-fields">
              <div>
                <div className="pg-field-label">Exam</div>
                <select
                  value={examId}
                  onChange={(e) => setExamId(e.target.value)}
                  style={fieldInput}
                >
                  {exams.length === 0 && <option value="">Loading exams…</option>}
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <div className="pg-field-label">Test name</div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mechanics + Thermo crunch · 30 min"
                  maxLength={200}
                  style={fieldInput}
                />
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="pg-section">
            <h2 className="pg-section-title">
              2. Sections
              <span className="pg-section-title-sub">
                {sections.length} section{sections.length === 1 ? "" : "s"} ·{" "}
                {totalQuestions} Q · {totalMinutes} min
              </span>
            </h2>
            {sections.map((s, i) => {
              const subjectTopics = topicsBySubject[s.subjectId] ?? [];
              return (
                <div
                  key={s.id}
                  style={{
                    padding: 14,
                    background: "var(--paper-2)",
                    border: "1px solid var(--rule)",
                    borderRadius: 6,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 100px 100px 130px auto",
                      gap: 10,
                      alignItems: "end",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div className="pg-field-label">Section name</div>
                      <input
                        value={s.name}
                        onChange={(e) => updateSection(i, { name: e.target.value })}
                        placeholder={`Section ${i + 1}`}
                        style={fieldInput}
                      />
                    </div>
                    <div>
                      <div className="pg-field-label">Subject</div>
                      <select
                        value={s.subjectId}
                        onChange={(e) => {
                          updateSection(i, { subjectId: e.target.value, topicIds: [] });
                          void ensureTopics(e.target.value);
                        }}
                        style={fieldInput}
                      >
                        <option value="">— pick subject —</option>
                        {subjectsForCurrent.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="pg-field-label">Questions</div>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={s.nQuestions}
                        onChange={(e) =>
                          updateSection(i, { nQuestions: Math.max(1, parseInt(e.target.value || "0", 10)) })
                        }
                        style={fieldInput}
                      />
                    </div>
                    <div>
                      <div className="pg-field-label">Minutes</div>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={s.nMinutes}
                        onChange={(e) =>
                          updateSection(i, { nMinutes: Math.max(1, parseInt(e.target.value || "0", 10)) })
                        }
                        style={fieldInput}
                      />
                    </div>
                    <div>
                      <div className="pg-field-label">Difficulty</div>
                      <select
                        value={s.difficulty}
                        onChange={(e) =>
                          updateSection(i, { difficulty: e.target.value as Difficulty })
                        }
                        style={fieldInput}
                      >
                        <option value="easy">Easy-heavy</option>
                        <option value="mixed">Mixed</option>
                        <option value="hard">Hard-heavy</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSections(sections.filter((_, j) => j !== i))}
                      disabled={sections.length === 1}
                      className="pg-btn pg-btn-ghost pg-btn-sm"
                      style={{ height: 34 }}
                    >
                      Remove
                    </button>
                  </div>

                  {s.subjectId && (
                    <div>
                      <div className="pg-field-label">
                        Topics{" "}
                        <span style={{ color: "var(--ink-4)", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
                          (optional — leave empty to pull from all topics in the subject)
                        </span>
                      </div>
                      {subjectTopics.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
                          Loading topics…
                        </p>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {subjectTopics.map((t) => {
                            const on = s.topicIds.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => toggleTopic(i, t.id)}
                                className={`pg-chip${on ? " on" : ""}`}
                              >
                                {t.title}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="pg-btn pg-btn-subtle"
              onClick={() => setSections([...sections, newSection()])}
              disabled={sections.length >= 10}
            >
              ＋ Add section
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="pg-section">
            <h2 className="pg-section-title">
              3. Rules
              <span className="pg-section-title-sub">marks + navigation</span>
            </h2>
            <div className="pg-fields">
              <div>
                <div className="pg-field-label">Marks per correct</div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={scoring.correct}
                  onChange={(e) =>
                    setScoring({ ...scoring, correct: Math.max(1, parseInt(e.target.value || "1", 10)) })
                  }
                  style={fieldInput}
                />
              </div>
              <div>
                <div className="pg-field-label">Negative marks per wrong</div>
                <input
                  type="number"
                  min={0}
                  max={4}
                  step={0.25}
                  value={scoring.negative}
                  onChange={(e) =>
                    setScoring({ ...scoring, negative: Math.max(0, parseFloat(e.target.value || "0")) })
                  }
                  style={fieldInput}
                />
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
                  0 disables negative marking.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={interSectionNav}
                  onChange={(e) => setInterSectionNav(e.target.checked)}
                />
                <span>
                  <strong style={{ color: "var(--ink)" }}>Allow inter-section navigation</strong>{" "}
                  <span style={{ color: "var(--ink-3)" }}>
                    — uncheck to lock the student to one section at a time.
                  </span>
                </span>
              </label>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={perSectionLock}
                  onChange={(e) => setPerSectionLock(e.target.checked)}
                />
                <span>
                  <strong style={{ color: "var(--ink)" }}>Enforce per-section time limits</strong>{" "}
                  <span style={{ color: "var(--ink-3)" }}>
                    — section ends when its minute budget hits zero, even if questions are left.
                  </span>
                </span>
              </label>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="pg-section">
            <h2 className="pg-section-title">
              4. Review &amp; launch
              <span className="pg-section-title-sub">double-check before saving</span>
            </h2>
            <div className="pg-stat-strip" style={{ marginBottom: 16 }}>
              <div className="pg-stat">
                <div className="pg-stat-label">Total questions</div>
                <div className="pg-stat-value">{totalQuestions}</div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Total minutes</div>
                <div className="pg-stat-value">{totalMinutes}</div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Scoring</div>
                <div className="pg-stat-value" style={{ fontSize: 16 }}>
                  +{scoring.correct} / −{scoring.negative}
                </div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Sections</div>
                <div className="pg-stat-value">{sections.length}</div>
              </div>
            </div>

            <div className="pg-list">
              {sections.map((s, i) => (
                <div className="pg-row" key={s.id}>
                  <div className="pg-row-main">
                    <p className="pg-row-title">
                      {s.name || `Section ${i + 1}`}
                    </p>
                    <div className="pg-row-meta">
                      <span>
                        {subjectsForCurrent.find((sub) => sub.id === s.subjectId)?.name ?? "Subject?"}
                      </span>
                      <span className="pg-row-meta-dot">·</span>
                      <span>{s.nQuestions} Q · {s.nMinutes} min</span>
                      <span className="pg-row-meta-dot">·</span>
                      <span>
                        {s.difficulty === "mixed" ? "Mixed difficulty" : s.difficulty === "easy" ? "Easy-heavy" : "Hard-heavy"}
                      </span>
                      {s.topicIds.length > 0 && (
                        <>
                          <span className="pg-row-meta-dot">·</span>
                          <span>{s.topicIds.length} topic{s.topicIds.length === 1 ? "" : "s"} picked</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Nav buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 18,
          }}
        >
          <button
            type="button"
            className="pg-btn pg-btn-ghost"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
            disabled={step === 1}
          >
            ← Back
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step < 4 ? (
              <button
                type="button"
                className="pg-btn pg-btn-primary"
                onClick={() => setStep((s) => (s + 1) as Step)}
                disabled={!canAdvance[step]}
              >
                Next →
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="pg-btn pg-btn-ghost"
                  onClick={() => save(false)}
                  disabled={submitting}
                >
                  {submitting ? "Saving…" : "Save without starting"}
                </button>
                <button
                  type="button"
                  className="pg-btn pg-btn-primary"
                  onClick={() => save(true)}
                  disabled={submitting}
                >
                  {submitting ? "Saving…" : "Save & start →"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 22,
        padding: "12px 16px",
        background: "var(--card)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
      }}
    >
      {STEPS.map((label, i) => {
        const idx = (i + 1) as Step;
        const active = idx === step;
        const done = idx < step;
        return (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: done || active ? 1 : 0.5,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                background: done
                  ? "var(--good)"
                  : active
                    ? "var(--info)"
                    : "var(--paper-2)",
                color: done || active ? "#fff" : "var(--ink-3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {done ? "✓" : idx}
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active ? "var(--ink)" : "var(--ink-3)",
              }}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span style={{ color: "var(--ink-4)", marginLeft: 4 }}>→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  background: "var(--card)",
  color: "var(--ink)",
  border: "1px solid var(--rule-2)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};