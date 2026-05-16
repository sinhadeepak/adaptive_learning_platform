// Sprint 24 (P4-S24) — PYQ drill view.
//
// Chapter-wise + year-wise navigation over the PYQ corpus. Shows
// frequency-by-chapter analysis ("trending up / down / flat") so
// students can spot which chapters dominate the recent papers.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

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
      <main className="page" style={{ padding: 24 }}>
        <p className="banner banner-error">{error}</p>
      </main>
    );
  }

  return (
    <main className="page" style={{ padding: 24, maxWidth: 1200 }}>
      <h1>PYQ Drill</h1>
      <p style={{ color: "var(--ink-3)" }}>
        Browse previous-year questions chapter-wise and year-wise. Frequency
        view shows which chapters dominate the recent papers.
      </p>

      {/* Subject pills */}
      <nav style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubjectId(s.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--rule)",
              background: subjectId === s.id ? "var(--card, #eef)" : "transparent",
            }}
          >
            {s.name}
          </button>
        ))}
      </nav>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, marginTop: 16 }}>
        {/* Chapter list with frequency */}
        <aside>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Chapters</h2>
          {frequency === null && <p>Loading…</p>}
          {frequency !== null && frequency.chapters.length === 0 && (
            <p style={{ color: "var(--ink-3)" }}>No PYQs for this subject yet.</p>
          )}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {frequency?.chapters.map((ch) => {
              const dir = trendDirection(ch.yearCounts);
              const arrow =
                dir === "up" ? "↑" : dir === "down" ? "↓" : dir === "single" ? "·" : "→";
              const arrowColor =
                dir === "up"
                  ? "var(--good, #10C47A)"
                  : dir === "down"
                  ? "var(--bad, #F43F5E)"
                  : "var(--ink-3)";
              return (
                <li key={ch.topicId} style={{ marginBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => setActiveTopicId(ch.topicId)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      borderRadius: 4,
                      border: "1px solid var(--rule)",
                      background:
                        activeTopicId === ch.topicId
                          ? "var(--card, #eef)"
                          : "transparent",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{ch.topicTitle}</span>
                    <span style={{ color: arrowColor, fontWeight: 600 }}>
                      {arrow} {totalAcrossYears(ch.yearCounts)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Question pane */}
        <section>
          {/* Year pills */}
          {allYears.length > 0 && (
            <nav style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setYearFilter(null)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--rule)",
                  background: yearFilter === null ? "var(--card, #eef)" : "transparent",
                }}
              >
                All years
              </button>
              {allYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYearFilter(y)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--rule)",
                    background: yearFilter === y ? "var(--card, #eef)" : "transparent",
                  }}
                >
                  {y}
                </button>
              ))}
            </nav>
          )}

          {/* Question list */}
          {questions === null && activeTopicId !== null && <p>Loading…</p>}
          {questions !== null && questions.items.length === 0 && (
            <p style={{ color: "var(--ink-3)" }}>No PYQs match this filter.</p>
          )}
          <ol style={{ listStyle: "none", padding: 0 }}>
            {questions?.items.map((q, i) => {
              const choice = revealed[q.id];
              const showAnswer = choice !== undefined;
              return (
                <li
                  key={q.id}
                  style={{
                    background: "var(--card-1, #fff)",
                    padding: 16,
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
                    Q{i + 1}
                    {q.examYear && ` · ${q.examYear}`}
                    {q.paperSession && ` · ${q.paperSession}`}
                  </div>
                  <p style={{ margin: "8px 0", fontSize: 17 }}>{q.stem}</p>
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {q.choices.map((c, idx) => {
                      const isCorrect = idx === q.correctIdx;
                      const isPicked = choice === idx;
                      const styleAfter = showAnswer
                        ? isCorrect
                          ? "var(--good, #10C47A)"
                          : isPicked
                          ? "var(--bad, #F43F5E)"
                          : "transparent"
                        : isPicked
                        ? "var(--card, #eef)"
                        : "transparent";
                      return (
                        <li key={idx}>
                          <button
                            type="button"
                            disabled={showAnswer}
                            onClick={() => setRevealed((r) => ({ ...r, [q.id]: idx }))}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: 8,
                              marginBottom: 4,
                              borderRadius: 4,
                              border: "1px solid var(--rule)",
                              background: styleAfter,
                              color: showAnswer && (isCorrect || isPicked) ? "#fff" : undefined,
                              cursor: showAnswer ? "default" : "pointer",
                            }}
                          >
                            {String.fromCharCode(65 + idx)}. {c}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {showAnswer && (
                    <p style={{ color: "var(--ink-3)", fontSize: 14 }}>
                      {choice === q.correctIdx ? "✓ Correct" : `✗ Correct answer: ${String.fromCharCode(65 + q.correctIdx)}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}