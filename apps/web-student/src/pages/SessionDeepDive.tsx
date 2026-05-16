// Phase 1D-1 — Post-test session analytics
//   Per-question time heatmap, section breakdown, time-vs-correctness scatter.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";

interface PerQuestionItem {
  itemIdx: number;
  questionId: string;
  sectionId?: string | null;
  timeSeconds: number | null;
  isCorrect: boolean | null;
  answerIdx: number | null;
  correctIdx: number;
  difficultyB: number;
  topicId: string;
}

interface PerQuestionResp {
  sessionId: string;
  items: PerQuestionItem[];
}

export function SessionDeepDive() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [resp, setResp] = useState<PerQuestionResp | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/quiz/sessions/${sessionId}/per-question-time`,
        );
        if (alive && r.ok) setResp((await r.json()) as PerQuestionResp);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId]);

  if (!sessionId) return <div>Missing session id.</div>;
  if (!loaded) return <AppShell title="Session deep-dive">Loading…</AppShell>;
  if (!resp || resp.items.length === 0) {
    return (
      <AppShell title="Session deep-dive">
        <main className="page" style={{ padding: 24 }}>
          <p>No items for this session yet.</p>
          <Link to="/history">← Back to history</Link>
        </main>
      </AppShell>
    );
  }

  const items = resp.items;
  const answered = items.filter((i) => i.isCorrect !== null);
  const correct = answered.filter((i) => i.isCorrect === true).length;
  const totalTime = answered.reduce((s, i) => s + (i.timeSeconds ?? 0), 0);
  const avgTime = answered.length > 0 ? totalTime / answered.length : 0;

  const correctTimes = answered.filter((i) => i.isCorrect).map((i) => i.timeSeconds ?? 0);
  const wrongTimes = answered.filter((i) => !i.isCorrect).map((i) => i.timeSeconds ?? 0);
  const avgCorrect = correctTimes.length > 0
    ? correctTimes.reduce((a, b) => a + b, 0) / correctTimes.length : 0;
  const avgWrong = wrongTimes.length > 0
    ? wrongTimes.reduce((a, b) => a + b, 0) / wrongTimes.length : 0;

  const maxTime = Math.max(...items.map((i) => i.timeSeconds ?? 0), 1);

  // Section roll-up
  const bySection: Record<string, { n: number; correct: number; time: number }> = {};
  for (const i of answered) {
    const k = i.sectionId ?? "—";
    if (!bySection[k]) bySection[k] = { n: 0, correct: 0, time: 0 };
    bySection[k].n += 1;
    if (i.isCorrect) bySection[k].correct += 1;
    bySection[k].time += i.timeSeconds ?? 0;
  }
  const sectionRows = Object.entries(bySection);

  // "Where you lost marks" — group wrong-answers by item bucket
  const lost = answered.filter((i) => !i.isCorrect).length;
  const unattempted = items.length - answered.length;

  return (
    <AppShell title="Session deep-dive">
      <main className="page" style={{ padding: 24, maxWidth: 1100 }}>
        <Link to="/history" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          ← Back to history
        </Link>
        <h1 style={{ marginTop: 8 }}>Session deep-dive</h1>
        <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
          <code>{resp.sessionId.slice(0, 8)}</code> · {items.length} items ·{" "}
          {answered.length} answered
        </p>

        {/* Headline numbers */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <Tile label="Score" value={`${correct} / ${items.length}`} tone="info" />
          <Tile label="Accuracy" value={`${answered.length > 0 ? Math.round((correct / answered.length) * 100) : 0}%`} tone="info" />
          <Tile label="Time" value={`${(totalTime / 60).toFixed(1)} min`} tone="neutral" />
          <Tile label="Avg / question" value={`${avgTime.toFixed(1)} s`} tone="neutral" />
          <Tile label="Lost / unattempted" value={`${lost} / ${unattempted}`} tone="warn" />
        </section>

        {/* Time-per-question heatmap (one cell per item, coloured by correctness, sized by time) */}
        <section style={{ marginBottom: 32 }}>
          <h3 style={subhead}>Time per question</h3>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>
            Cell colour = correctness · cell width = relative time.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {items.map((i) => {
              const t = i.timeSeconds ?? 0;
              const w = Math.max(20, (t / maxTime) * 80);
              const bg =
                i.isCorrect === true
                  ? "var(--good, #10C47A)"
                  : i.isCorrect === false
                    ? "var(--bad, #f43f5e)"
                    : "var(--paper-2, #2a2a2a)";
              return (
                <div
                  key={i.itemIdx}
                  title={`Q${i.itemIdx + 1}: ${t.toFixed(1)}s · ${i.isCorrect === null ? "unattempted" : i.isCorrect ? "correct" : "wrong"}`}
                  style={{
                    width: w,
                    height: 24,
                    background: bg,
                    borderRadius: 3,
                    fontSize: 10,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                  }}
                >
                  {i.itemIdx + 1}
                </div>
              );
            })}
          </div>
        </section>

        {/* Time-vs-correctness scatter */}
        <section style={{ marginBottom: 32 }}>
          <h3 style={subhead}>Time-vs-correctness</h3>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>
            Avg time on correct: <strong>{avgCorrect.toFixed(1)}s</strong> ·{" "}
            on wrong: <strong>{avgWrong.toFixed(1)}s</strong>
            {avgWrong > avgCorrect * 1.3
              ? " — you're spending more time on wrong answers (try cutting losses)."
              : avgWrong < avgCorrect * 0.7
                ? " — wrong answers are quick (rushing? try slowing down)."
                : " — your time spend looks calibrated."}
          </p>
          <div
            style={{
              position: "relative",
              height: 160,
              border: "1px solid var(--rule, #333)",
              borderRadius: 8,
              padding: 8,
              background: "var(--paper-2, #1a1a1a)",
            }}
          >
            {answered.map((i) => {
              const t = i.timeSeconds ?? 0;
              const x = (t / maxTime) * 100;
              const y = i.isCorrect ? 20 : 80;
              return (
                <div
                  key={i.itemIdx}
                  title={`Q${i.itemIdx + 1}: ${t.toFixed(1)}s · ${i.isCorrect ? "correct" : "wrong"}`}
                  style={{
                    position: "absolute",
                    left: `calc(${x}% - 5px)`,
                    top: `${y}%`,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: i.isCorrect ? "var(--good)" : "var(--bad)",
                    opacity: 0.7,
                  }}
                />
              );
            })}
            <div style={{ position: "absolute", left: 8, top: 8, fontSize: 10, color: "var(--ink-3)" }}>
              Correct
            </div>
            <div style={{ position: "absolute", left: 8, bottom: 8, fontSize: 10, color: "var(--ink-3)" }}>
              Wrong
            </div>
            <div style={{ position: "absolute", right: 8, bottom: 8, fontSize: 10, color: "var(--ink-3)" }}>
              Time →
            </div>
          </div>
        </section>

        {/* Section breakdown */}
        {sectionRows.length > 0 && (
          <section>
            <h3 style={subhead}>By section</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--rule, #333)" }}>
                  <th style={th}>Section</th>
                  <th style={th}>N</th>
                  <th style={th}>Correct</th>
                  <th style={th}>Accuracy</th>
                  <th style={th}>Avg time</th>
                </tr>
              </thead>
              <tbody>
                {sectionRows.map(([sec, agg]) => (
                  <tr key={sec} style={{ borderBottom: "1px solid var(--rule, #333)" }}>
                    <td style={td}>{sec}</td>
                    <td style={td}>{agg.n}</td>
                    <td style={td}>{agg.correct}</td>
                    <td style={td}>{Math.round((agg.correct / agg.n) * 100)}%</td>
                    <td style={td}>{(agg.time / agg.n).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </AppShell>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "info" | "neutral" | "warn";
}) {
  const color = tone === "info"
    ? "var(--info, #4F87F6)"
    : tone === "warn"
      ? "var(--warn, #fbbf24)"
      : "var(--ink)";
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

const subhead: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--ink-2, #ccc)",
  marginBottom: 8,
};
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  fontSize: 11,
  color: "var(--ink-3)",
  textTransform: "uppercase",
};
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };