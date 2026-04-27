import { useEffect, useState } from "react";
import { auth } from "../lib/api";

// Renders the teaching note for one quiz item. Order of preference:
//   1. The stored `explanation` shipped from Quiz (authored content).
//   2. An LLM-generated note from /adaptive/explain (when no stored note).
//   3. A heuristic stub (when the LLM is off — same endpoint, source: heuristic).
//
// The card always renders something — a quiz item without a teaching note is
// the regression we're trying to kill.

interface ExplainCardProps {
  itemIdx: number;
  questionId: string;
  stem?: string;
  choices?: string[];
  correctIdx?: number;
  pickedIdx?: number;
  answered: boolean;
  isCorrect?: boolean;
  storedExplanation?: string | null;
  topicTitle?: string;
}

interface ExplainResponse {
  explanation: string;
  key_concept: string;
  common_pitfall: string;
  source: "ai" | "heuristic";
}

export function ExplainCard({
  itemIdx,
  questionId,
  stem,
  choices,
  correctIdx,
  pickedIdx,
  answered,
  isCorrect,
  storedExplanation,
  topicTitle,
}: ExplainCardProps) {
  const [generated, setGenerated] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  // Auto-fetch a generated note when no stored explanation exists, the question
  // content is hydrated, and the student got it wrong (priority case). Correct
  // answers get the note on demand via the "Explain" button to keep token usage
  // bounded — students who got it right rarely re-read.
  useEffect(() => {
    if (storedExplanation) return;
    if (generated || loading || !stem || !choices || correctIdx === undefined) return;
    if (answered && isCorrect) return;
    setLoading(true);
    setRequested(true);
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/adaptive/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stem,
            choices,
            correctIdx,
            pickedIdx,
            topicTitle,
          }),
        });
        if (r.ok) setGenerated((await r.json()) as ExplainResponse);
      } catch {
        /* swallow — card just hides the generated portion */
      } finally {
        setLoading(false);
      }
    })();
  }, [
    storedExplanation,
    stem,
    choices,
    correctIdx,
    pickedIdx,
    answered,
    isCorrect,
    topicTitle,
    generated,
    loading,
  ]);

  async function explainOnDemand() {
    if (!stem || !choices || correctIdx === undefined) return;
    setLoading(true);
    setRequested(true);
    try {
      const r = await auth.fetch("/api/v1/adaptive/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stem, choices, correctIdx, pickedIdx, topicTitle }),
      });
      if (r.ok) setGenerated((await r.json()) as ExplainResponse);
    } finally {
      setLoading(false);
    }
  }

  // No content hydrated and no stored note — nothing to show.
  if (!storedExplanation && !stem) return null;

  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        borderLeft: "2px solid var(--color-blue)",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: "var(--text-faint)",
          marginBottom: 6,
        }}
      >
        <span>Q{itemIdx + 1} · why this answer</span>
        {generated ? (
          <span
            style={{
              fontSize: 10,
              color:
                generated.source === "ai" ? "var(--color-blue)" : "var(--text-faint)",
            }}
          >
            {generated.source === "ai" ? "◈ AI" : "◈ Heuristic"}
          </span>
        ) : storedExplanation ? (
          <span style={{ fontSize: 10, color: "var(--color-green)" }}>◈ Authored</span>
        ) : null}
      </div>

      {storedExplanation ? (
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{storedExplanation}</div>
      ) : generated ? (
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <div>{generated.explanation}</div>
          {generated.common_pitfall ? (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <strong>Pitfall:</strong> {generated.common_pitfall}
            </div>
          ) : null}
          {generated.key_concept ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: "var(--text-faint)",
              }}
            >
              Concept: {generated.key_concept}
            </div>
          ) : null}
        </div>
      ) : loading ? (
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
          Generating teaching note…
        </div>
      ) : !requested ? (
        <button
          type="button"
          onClick={explainOnDemand}
          style={{
            background: "transparent",
            border: "1px solid var(--color-blue)",
            color: "var(--color-blue)",
            padding: "4px 10px",
            borderRadius: 4,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Explain this answer
        </button>
      ) : null}
      {/* questionId surfaced for debugging / analytics hooks */}
      <span style={{ display: "none" }}>{questionId}</span>
    </div>
  );
}
