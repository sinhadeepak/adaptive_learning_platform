import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";

interface MockSectionResult {
  name: string;
  correct: number;
  wrong: number;
  unanswered: number;
  total: number;
}

interface MockResult {
  examCode: string;
  examName: string;
  rawScore: number;
  maxMarks: number;
  accuracy: number;
  totalQuestions: number;
  nCorrect: number;
  nWrong: number;
  nUnanswered: number;
  percentile: number;
  projectedRank: number;
  rankLow: number;
  rankHigh: number;
  confidence: "low" | "medium" | "high";
  sections: MockSectionResult[];
  error?: string;
  message?: string;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export function MockResult() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<MockResult | null>(null);

  useEffect(() => {
    const attemptId = searchParams.get("attemptId");

    // Deep-link from /history → load the persisted attempt by id. Server
    // returns the slim shape we need; rankLow/rankHigh aren't persisted so
    // we synthesise them from the projected rank for display continuity.
    if (attemptId) {
      let alive = true;
      (async () => {
        try {
          const r = await auth.fetch(`/api/v1/profile/mock-attempts`);
          if (!r.ok) {
            navigate("/history", { replace: true });
            return;
          }
          const body = (await r.json()) as {
            items: Array<{
              id: string;
              examCode: string;
              examName: string | null;
              rawScore: number;
              maxMarks: number;
              accuracy: number;
              totalQuestions: number;
              nCorrect: number;
              nWrong: number;
              nUnanswered: number;
              percentile: number | null;
              projectedRank: number | null;
              confidence: string | null;
              sections: MockSectionResult[];
            }>;
          };
          const a = body.items.find((it) => it.id === attemptId);
          if (!a) {
            navigate("/history", { replace: true });
            return;
          }
          if (!alive) return;
          const conf = (a.confidence ?? "low") as "low" | "medium" | "high";
          const rank = a.projectedRank ?? 0;
          const halfWidth = conf === "high" ? 0.05 : conf === "medium" ? 0.15 : 0.30;
          setResult({
            examCode: a.examCode,
            examName: a.examName ?? a.examCode,
            rawScore: a.rawScore,
            maxMarks: a.maxMarks,
            accuracy: a.accuracy,
            totalQuestions: a.totalQuestions,
            nCorrect: a.nCorrect,
            nWrong: a.nWrong,
            nUnanswered: a.nUnanswered,
            percentile: a.percentile ?? 0,
            projectedRank: rank,
            rankLow: rank ? Math.max(1, Math.round(rank * (1 - halfWidth))) : 0,
            rankHigh: rank ? Math.round(rank * (1 + halfWidth)) : 0,
            confidence: conf,
            sections: a.sections ?? [],
          });
        } catch {
          navigate("/history", { replace: true });
        }
      })();
      return () => {
        alive = false;
      };
    }

    // Inline path: most recent score handed off via sessionStorage.
    const raw = sessionStorage.getItem("alp.mock.lastResult");
    if (!raw) {
      navigate("/practice", { replace: true });
      return;
    }
    setResult(JSON.parse(raw) as MockResult);
  }, [navigate, searchParams]);

  if (!result) {
    return (
      <AppShell title="Mock Result">
        <div className="card" style={{ padding: 20 }}>Loading…</div>
      </AppShell>
    );
  }
  if (result.error) {
    return (
      <AppShell title="Mock Result">
        <div className="card" style={{ padding: 20, color: "var(--color-red)" }}>
          {result.message ?? "Could not score the mock."}
        </div>
      </AppShell>
    );
  }

  const scorePct = result.maxMarks > 0 ? Math.round((result.rawScore / result.maxMarks) * 100) : 0;
  const scoreTone =
    result.percentile >= 90
      ? "var(--color-green)"
      : result.percentile >= 60
        ? "var(--color-blue)"
        : "var(--color-amber)";
  const confTone =
    result.confidence === "high"
      ? "var(--color-green)"
      : result.confidence === "medium"
        ? "var(--color-blue)"
        : "var(--color-amber)";

  return (
    <AppShell title="Mock Result">
      {/* Trophy hero */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div
          style={{
            width: 90,
            height: 90,
            margin: "12px auto 18px",
            background: `linear-gradient(135deg, ${scoreTone}, ${scoreTone}99)`,
            borderRadius: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 48,
          }}
        >
          🏆
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: scoreTone,
            lineHeight: 1,
          }}
        >
          {result.rawScore} / {result.maxMarks}
        </div>
        <div style={{ marginTop: 6, color: "var(--text-primary)", fontSize: 14 }}>
          {result.examName} · {scorePct}% raw · {result.percentile.toFixed(1)} pctl
        </div>
      </div>

      {/* Predicted AIR card */}
      <section
        className="card"
        style={{
          background: "linear-gradient(135deg, rgba(102,67,255,0.08), rgba(79,135,246,0.04))",
          borderLeft: "3px solid var(--color-purple)",
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 0.8, color: "var(--text-muted)", fontWeight: 700 }}>
          PROJECTED ALL-INDIA RANK
        </div>
        <div style={{ fontSize: 38, fontWeight: 700, color: "var(--color-purple)", lineHeight: 1, marginTop: 6 }}>
          ~{fmt(result.projectedRank)}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          range {fmt(result.rankLow)} – {fmt(result.rankHigh)}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center" }}>
          <span style={{ color: confTone, fontWeight: 600, fontSize: 12 }}>● {result.confidence} confidence</span>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>· based on this paper</span>
        </div>
      </section>

      {/* 3-stat strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <div className="card" style={statTile("var(--color-green)")}>
          <div style={statValue}>{result.nCorrect}</div>
          <div style={statLabel}>Correct</div>
        </div>
        <div className="card" style={statTile("var(--color-red)")}>
          <div style={statValue}>{result.nWrong}</div>
          <div style={statLabel}>Wrong</div>
        </div>
        <div className="card" style={statTile("var(--text-muted)")}>
          <div style={statValue}>{result.nUnanswered}</div>
          <div style={statLabel}>Skipped</div>
        </div>
      </div>

      <h2 className="section-heading">Section Breakdown</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {result.sections.map((s) => {
          const accuracy = s.total === 0 ? 0 : s.correct / s.total;
          const tone =
            accuracy >= 0.7
              ? "var(--color-green)"
              : accuracy >= 0.4
                ? "var(--color-blue)"
                : "var(--color-red)";
          return (
            <div key={s.name} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <strong style={{ color: "var(--text-primary)", fontSize: 14 }}>{s.name}</strong>
                <strong style={{ color: tone, fontSize: 14 }}>
                  {s.correct} / {s.total}
                </strong>
              </div>
              <div style={{ background: "var(--bg-surface3)", borderRadius: 2, height: 5, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.round(accuracy * 100)}%`,
                    background: tone,
                    height: "100%",
                  }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                {s.wrong} wrong · {s.unanswered} skipped
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          to={`/mock?exam=${encodeURIComponent(result.examCode)}`}
          className="btn btn-primary"
          style={{ flex: 1, minWidth: 140, textAlign: "center" }}
        >
          ↺ Take another mock
        </Link>
        <Link to="/history" className="btn btn-secondary" style={{ flex: 1, minWidth: 140, textAlign: "center" }}>
          History
        </Link>
        <Link to="/home" className="btn btn-ghost" style={{ flex: 1, minWidth: 100, textAlign: "center" }}>
          Home
        </Link>
      </div>
    </AppShell>
  );
}

const statTile = (tone: string): React.CSSProperties => ({
  padding: 12,
  textAlign: "center",
  borderTop: `2px solid ${tone}`,
});
const statValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "var(--text-primary)",
};
const statLabel: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginTop: 2,
};
