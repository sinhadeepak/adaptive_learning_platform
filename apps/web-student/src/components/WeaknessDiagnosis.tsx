import { useEffect, useState } from "react";
import { auth } from "../lib/api";

// Cross-topic weakness diagnosis card.
// Pulls from /adaptive/weakness-diagnosis/{user_id} which:
//   - reads recent answered items + per-topic EWA
//   - asks the LLM to find sub-skill patterns spanning multiple topics
//   - returns 0-3 patterns + an overall assessment, OR falls back to a
//     heuristic stub when evidence is too thin / LLM is off
//
// Card auto-hides for users with no quiz history; otherwise it always renders
// something (assessment + topic ranking) even when no patterns are found.

interface Pattern {
  name: string;
  description: string;
  subjects_affected: string[];
  severity: "high" | "medium" | "low";
  evidence_count: number;
  prescription: string;
}

interface WeaknessResponse {
  overall_assessment: string;
  patterns: Pattern[];
  weakest_topics: string[];
  n_attempts_analyzed: number;
  n_wrong: number;
  source: "ai" | "heuristic";
  message?: string;
}

const SEV_TONE: Record<Pattern["severity"], string> = {
  high: "var(--color-red)",
  medium: "var(--color-amber)",
  low: "var(--color-blue)",
};

export function WeaknessDiagnosis({ userId }: { userId: string }) {
  const [data, setData] = useState<WeaknessResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/adaptive/weakness-diagnosis/${userId}`,
        );
        if (r.ok) setData((await r.json()) as WeaknessResponse);
      } catch {
        /* swallow — card hides on failure */
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading || !data) return null;
  // Cold-start users: don't pollute the dashboard with empty advice.
  if (data.n_attempts_analyzed === 0 && data.weakest_topics.length === 0) return null;

  return (
    <section
      className="card"
      style={{
        marginTop: "var(--sp-5)",
        borderLeft: "3px solid var(--color-amber)",
      }}
    >
      <div className="sec-row">
        <h2 className="section-heading">Cross-topic weakness diagnosis</h2>
        <span
          className={`pill pill-${data.source === "ai" ? "info" : "neutral"}`}
        >
          {data.source === "ai" ? "◈ AI pattern detection" : "◈ Heuristic"}
        </span>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
          marginTop: 4,
          lineHeight: 1.5,
        }}
      >
        {data.overall_assessment}
      </p>

      {data.patterns.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 12,
          }}
        >
          {data.patterns.map((p, i) => (
            <div
              key={i}
              style={{
                padding: 12,
                background: "var(--surface-elev1)",
                borderLeft: `3px solid ${SEV_TONE[p.severity]}`,
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <strong style={{ fontSize: 14 }}>{p.name}</strong>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: 11,
                    color: "var(--text-faint)",
                  }}
                >
                  <span style={{ color: SEV_TONE[p.severity] }}>
                    ● {p.severity}
                  </span>
                  <span>· {p.evidence_count} wrong answers fit this</span>
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                  lineHeight: 1.5,
                }}
              >
                {p.description}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  marginBottom: 6,
                }}
              >
                Affects: {p.subjects_affected.join(" · ")}
              </div>
              <div
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  background: "rgba(16,196,122,0.06)",
                  borderLeft: "2px solid var(--color-green)",
                  borderRadius: 4,
                }}
              >
                <strong style={{ color: "var(--color-green)" }}>
                  Next move:
                </strong>{" "}
                {p.prescription}
              </div>
            </div>
          ))}
        </div>
      ) : data.weakest_topics.length > 0 ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--text-muted)",
            padding: "8px 12px",
            background: "var(--surface-elev1)",
            borderRadius: 4,
          }}
        >
          <strong>Weakest topics by EWA:</strong>{" "}
          {data.weakest_topics.join(" · ")}
        </div>
      ) : null}

      {data.message ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "var(--text-faint)",
            fontStyle: "italic",
          }}
        >
          {data.message}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "var(--text-faint)",
          display: "flex",
          gap: 12,
        }}
      >
        <span>📊 {data.n_attempts_analyzed} items analysed</span>
        <span>· {data.n_wrong} wrong</span>
      </div>
    </section>
  );
}
