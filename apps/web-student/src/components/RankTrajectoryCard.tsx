import { useEffect, useState } from "react";
import { auth } from "../lib/api";

// Predicted All India Rank (or percentile band for non-ranked exams).
// Pulls from /adaptive/rank-projection/{userId}?exam=…
//
// Same shape returned whether or not OPENAI_API_KEY is set — the headline +
// next_action lines come from the LLM when on, from a tuned heuristic when off.

interface Commentary {
  headline: string;
  next_action: string;
}

interface RankProjection {
  examCode: string;
  examName: string;
  totalCandidates: number;
  readiness: number;
  nAttempts: number;
  projectedPercentile: number;
  projectedRank: number;
  rankLow: number;
  rankHigh: number;
  confidence: "low" | "medium" | "high";
  commentary: Commentary;
  examContext: string;
  source: "ai" | "heuristic";
  error?: string;
  message?: string;
}

const EXAM_OPTIONS = [
  { code: "NEET", label: "NEET (UG)" },
  { code: "JEE", label: "JEE Main" },
  { code: "UPSC", label: "UPSC CSE" },
  { code: "CBSE", label: "CBSE 12" },
];

function fmtRank(n: number): string {
  return n.toLocaleString("en-IN");
}

export function RankTrajectoryCard({ userId }: { userId: string }) {
  const [examCode, setExamCode] = useState<string>(() => {
    return localStorage.getItem("alp.targetExam") || "NEET";
  });
  const [data, setData] = useState<RankProjection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/adaptive/rank-projection/${userId}?exam=${examCode}`,
        );
        if (r.ok) setData((await r.json()) as RankProjection);
      } catch {
        /* swallow — card hides on failure */
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, examCode]);

  function pickExam(code: string) {
    setExamCode(code);
    localStorage.setItem("alp.targetExam", code);
  }

  if (loading || !data) return null;
  if (data.error) {
    // Unknown exam (e.g. user picked one with no calibration). Fall back gracefully.
    return null;
  }

  const confTone =
    data.confidence === "high"
      ? "var(--color-green)"
      : data.confidence === "medium"
      ? "var(--color-blue)"
      : "var(--color-amber)";

  return (
    <section
      className="card"
      style={{
        marginTop: "var(--sp-5)",
        background:
          "linear-gradient(135deg, rgba(102,67,255,0.08), rgba(79,135,246,0.04))",
        borderLeft: "3px solid var(--color-purple)",
      }}
    >
      <div className="sec-row">
        <h2 className="section-heading">Projected {data.examName} rank</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {EXAM_OPTIONS.map((e) => (
            <button
              key={e.code}
              type="button"
              onClick={() => pickExam(e.code)}
              style={{
                background:
                  e.code === examCode ? "rgba(102,67,255,0.2)" : "transparent",
                color:
                  e.code === examCode ? "var(--color-purple)" : "var(--text-faint)",
                border: "1px solid var(--border-strong)",
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(140px, 220px) 1fr",
          gap: 24,
          marginTop: 12,
          alignItems: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              letterSpacing: "0.05em",
            }}
          >
            ALL-INDIA RANK
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: "var(--color-purple)",
              lineHeight: 1,
              marginTop: 4,
            }}
          >
            ~{fmtRank(data.projectedRank)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            range {fmtRank(data.rankLow)} – {fmtRank(data.rankHigh)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: confTone,
              marginTop: 4,
              fontWeight: 600,
            }}
          >
            ● {data.confidence} confidence · {data.projectedPercentile.toFixed(1)} pctl
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            {data.commentary.headline}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              padding: "8px 12px",
              background: "rgba(16,196,122,0.06)",
              borderLeft: "2px solid var(--color-green)",
              borderRadius: 4,
            }}
          >
            <strong style={{ color: "var(--color-green)" }}>Next move:</strong>{" "}
            {data.commentary.next_action}
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              fontSize: 11,
              color: "var(--text-faint)",
              flexWrap: "wrap",
            }}
          >
            <span>📊 Readiness {(data.readiness * 100).toFixed(0)}%</span>
            <span>· {data.nAttempts} attempts</span>
            <span>· {fmtRank(data.totalCandidates)} candidate pool</span>
            <span style={{ marginLeft: "auto" }}>
              {data.source === "ai" ? "◈ AI commentary" : "◈ Heuristic"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
