import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";

// Fetched from adaptive-engine `/adaptive/guided-next-steps/{userId}`. Always
// returns 3 items — `source: "ai"` when the LLM produced them, `"heuristic"`
// when it fell back to mastery-vector ordering. UI surfaces the source so the
// learner can see when the AI layer is engaged.
interface GuidedStep {
  action: "REVISE" | "PRACTICE" | "DIAGNOSE" | "MOCK_SLICE";
  topicId: string;
  topicTitle: string;
  why: string;
  estMinutes: number;
}

interface GuidedNextStepsResponse {
  headline: string;
  steps: GuidedStep[];
  source: "ai" | "heuristic";
}

const ACTION_META: Record<
  GuidedStep["action"],
  { label: string; icon: string; tone: string }
> = {
  REVISE: { label: "Revise", icon: "📖", tone: "var(--info)" },
  PRACTICE: { label: "Practice", icon: "✎", tone: "var(--good)" },
  DIAGNOSE: { label: "Diagnose", icon: "◈", tone: "var(--accent)" },
  MOCK_SLICE: { label: "Mock slice", icon: "⏱", tone: "var(--warn)" },
};

function actionRoute(step: GuidedStep): string {
  if (!step.topicId) return "/catalog";
  switch (step.action) {
    case "REVISE":
      return `/catalog/topic/${step.topicId}`;
    case "PRACTICE":
    case "DIAGNOSE":
    case "MOCK_SLICE":
      return `/catalog/topic/${step.topicId}?mode=${step.action.toLowerCase()}`;
  }
}

export function GuidedNextSteps({ userId }: { userId: string }) {
  const [data, setData] = useState<GuidedNextStepsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/adaptive/guided-next-steps/${userId}`,
        );
        if (r.ok) setData((await r.json()) as GuidedNextStepsResponse);
      } catch {
        /* swallow — panel just hides on failure */
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading || !data) return null;

  return (
    <section className="card" style={{ marginTop: "var(--sp-5)" }}>
      <div className="sec-row">
        <h2 className="section-heading">{data.headline}</h2>
        <span
          className={`pill pill-${data.source === "ai" ? "info" : "neutral"}`}
        >
          {data.source === "ai" ? "◈ AI-personalised" : "◈ Heuristic plan"}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--sp-3)",
          marginTop: "var(--sp-3)",
        }}
      >
        {data.steps.map((step, i) => {
          const meta = ACTION_META[step.action];
          return (
            <Link
              key={i}
              to={actionRoute(step)}
              className="card"
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                borderLeft: `3px solid ${meta.tone}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 11,
                  color: "var(--ink-4)",
                }}
              >
                <span style={{ color: meta.tone, fontWeight: 600 }}>
                  {meta.icon} {meta.label.toUpperCase()}
                </span>
                <span>~{step.estMinutes} min</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {step.topicTitle}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>
                {step.why}
              </div>
              <div style={{ marginTop: "auto", fontSize: 11, color: meta.tone, fontWeight: 600 }}>
                Start →
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}