// PYQDrill — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + title + subject chips) → 320px aside
// with chapter list + frequency arrows → main section with year-filter
// chips + question cards (vidya-card-block per question, tinted
// option buttons for correct/incorrect reveal).

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
import { auth } from "../lib/api";
import {
  totalAcrossYears,
  trendDirection,
  type YearCounts,
} from "../lib/pyq_frequency";

interface FrequencyRow {
  topicId: string;
  topicTitle: string;
  yearCounts: YearCounts;
  total: number;
}

interface FrequencyResponse {
  examId: string;
  subjectId: string | null;
  chapters: FrequencyRow[];
}

interface PyqItem {
  id: string;
  topicId: string;
  stem: string;
  choices: string[];
  correctIdx: number;
  examYear: number | null;
  paperSession: string | null;
  language: string;
}

interface PyqListResp {
  items: PyqItem[];
  total: number;
  page: number;
  perPage: number;
}

interface Subject {
  id: string;
  name: string;
}

const JEE_MAIN_ID = "11111111-0000-0000-0000-000000000001";

export function PYQDrill() {
  const [params] = useSearchParams();
  const examId = params.get("examId") ?? JEE_MAIN_ID;

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<FrequencyResponse | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [questions, setQuestions] = useState<PyqListResp | null>(null);
  const [revealed, setRevealed] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  // Subjects for this exam — drives the subject pill row.
  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (!r.ok) return;
        const list = (await r.json()) as Subject[];
        setSubjects(list);
        if (list.length > 0 && !subjectId) setSubjectId(list[0].id);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [examId]);

  // Frequency view per subject.
  useEffect(() => {
    if (!subjectId) return;
    (async () => {
      const url = `/api/v1/content/pyqs/frequency?examId=${examId}&subjectId=${subjectId}`;
      const r = await auth.fetch(url);
      if (!r.ok) {
        setError("Could not load PYQ frequency.");
        return;
      }
      const body = (await r.json()) as FrequencyResponse;
      setFrequency(body);
      setActiveTopicId(body.chapters[0]?.topicId ?? null);
      setYearFilter(null);
    })();
  }, [examId, subjectId]);

  // Question list for the active chapter (+ year filter).
  useEffect(() => {
    if (!activeTopicId) {
      setQuestions(null);
      return;
    }
    (async () => {
      const yearQs = yearFilter ? `&year=${yearFilter}` : "";
      const url = `/api/v1/content/pyqs?topicId=${activeTopicId}${yearQs}&perPage=50`;
      const r = await auth.fetch(url);
      if (!r.ok) {
        setError("Could not load PYQs.");
        return;
      }
      const body = (await r.json()) as PyqListResp;
      setQuestions(body);
      setRevealed({});
    })();
  }, [activeTopicId, yearFilter]);

  const allYears = useMemo(() => {
    if (!frequency) return [];
    const set = new Set<number>();
    for (const ch of frequency.chapters) {
      for (const y of Object.keys(ch.yearCounts)) set.add(Number(y));
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [frequency]);

  if (error) {
    return (
      <VidyaShell
        crumbs="LEARN · PYQ HUB"
        title="PYQ Drill"
        subtitle="Browse previous-year questions chapter-wise and year-wise. Frequency view shows which chapters dominate the recent papers."
      >
        <div role="alert" style={{
          padding: "var(--sp-3) var(--sp-4)",
          marginBottom: "var(--sp-4)",
          background: "var(--bad)",
          color: "var(--paper)",
          borderRadius: 8,
          fontSize: 13,
        }}>
          {error}
        </div>
      </VidyaShell>
    );
  }

  return (
    <VidyaShell
      crumbs="LEARN · PYQ HUB"
      title="PYQ Drill"
      subtitle="Browse previous-year questions chapter-wise and year-wise. Frequency view shows which chapters dominate the recent papers."
      chips={
        <>
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`vidya-shell__chip${subjectId === s.id ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setSubjectId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "var(--sp-4)" }}>
        {/* Chapter list with frequency */}
        <aside>
          <h3 style={{ margin: "0 0 var(--sp-3)", fontSize: 13, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.6 }}>
            Chapters
          </h3>
          {frequency === null && <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</p>}
          {frequency !== null && frequency.chapters.length === 0 && (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No PYQs for this subject yet.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {frequency?.chapters.map((ch) => {
              const dir = trendDirection(ch.yearCounts);
              const arrow =
                dir === "up" ? "↑" : dir === "down" ? "↓" : dir === "single" ? "·" : "→";
              const arrowColor =
                dir === "up" ? "var(--good)" : dir === "down" ? "var(--bad)" : "var(--ink-3)";
              const isActive = activeTopicId === ch.topicId;
              return (
                <button
                  key={ch.topicId}
                  type="button"
                  onClick={() => setActiveTopicId(ch.topicId)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--rule)",
                    background: isActive ? "var(--accent-soft)" : "var(--paper)",
                    color: isActive ? "var(--accent-2)" : "var(--ink)",
                    fontWeight: isActive ? 600 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ch.topicTitle}
                  </span>
                  <span style={{ color: arrowColor, fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                    {arrow} {totalAcrossYears(ch.yearCounts)}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section>
          {/* Year pills */}
          {allYears.length > 0 && (
            <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
              <button
                type="button"
                role="tab"
                aria-selected={yearFilter === null}
                className={`vidya-shell__chip${yearFilter === null ? " vidya-shell__chip--on" : ""}`}
                onClick={() => setYearFilter(null)}
              >
                All years
              </button>
              {allYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  role="tab"
                  aria-selected={yearFilter === y}
                  className={`vidya-shell__chip${yearFilter === y ? " vidya-shell__chip--on" : ""}`}
                  onClick={() => setYearFilter(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* Question list */}
          {questions === null && activeTopicId !== null && (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</p>
          )}
          {questions !== null && questions.items.length === 0 && (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No PYQs match this filter.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            {questions?.items.map((q, i) => {
              const choice = revealed[q.id];
              const showAnswer = choice !== undefined;
              return (
                <article key={q.id} className="vidya-card-block">
                  <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>
                    Q{i + 1}
                    {q.examYear && ` · ${q.examYear}`}
                    {q.paperSession && ` · ${q.paperSession}`}
                  </div>
                  <p style={{ margin: "var(--sp-2) 0 var(--sp-3)", fontSize: 15, lineHeight: 1.5, color: "var(--ink)" }}>
                    {q.stem}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {q.choices.map((c, idx) => {
                      const isCorrect = idx === q.correctIdx;
                      const isPicked = choice === idx;
                      let background = "var(--paper)";
                      let color = "var(--ink)";
                      let border = "1px solid var(--rule)";
                      if (showAnswer) {
                        if (isCorrect) {
                          background = "var(--good-soft)";
                          color = "var(--good)";
                          border = "1px solid var(--good)";
                        } else if (isPicked) {
                          background = "var(--bad-soft)";
                          color = "var(--bad)";
                          border = "1px solid var(--bad)";
                        }
                      } else if (isPicked) {
                        background = "var(--accent-soft)";
                        border = "1px solid var(--accent)";
                      }
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={showAnswer}
                          onClick={() => setRevealed((r) => ({ ...r, [q.id]: idx }))}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            borderRadius: 8,
                            border,
                            background,
                            color,
                            cursor: showAnswer ? "default" : "pointer",
                            fontSize: 13,
                          }}
                        >
                          {String.fromCharCode(65 + idx)}. {c}
                        </button>
                      );
                    })}
                  </div>
                  {showAnswer && (
                    <p style={{ marginTop: "var(--sp-2)", color: choice === q.correctIdx ? "var(--good)" : "var(--bad)", fontSize: 13, fontWeight: 600 }}>
                      {choice === q.correctIdx ? "✓ Correct" : `✗ Correct answer: ${String.fromCharCode(65 + q.correctIdx)}`}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </VidyaShell>
  );
}
