// Phase 3.5 — AI revision capsule.
//
// A one-page, exam-ready summary of a topic, distilled by the AI Gateway from
// the topic's published questions + explanations and cached server-side.
// Route: /capsule/:topicId

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
import { auth } from "../lib/api";

interface Capsule {
  summary: string;
  key_points: string[];
  formulas: string[];
  common_mistakes: string[];
  quick_review: string[];
}

interface CapsuleResponse {
  capsule: Capsule;
  sourceCount: number;
  cached?: boolean;
  generatedAt?: string;
}

export function RevisionCapsule() {
  const { topicId } = useParams<{ topicId: string }>();
  const [search] = useSearchParams();
  const title = search.get("title") ?? "";
  const [data, setData] = useState<CapsuleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  async function load(refresh = false) {
    if (!topicId) return;
    setError(null);
    if (refresh) setRegenerating(true);
    try {
      const r = await auth.fetch(
        `/api/v1/content/topics/${topicId}/revision-capsule${refresh ? "?refresh=true" : ""}`,
      );
      if (r.status === 409) {
        setError("This topic doesn't have published questions yet, so there's nothing to summarise.");
        return;
      }
      if (!r.ok) {
        setError("We couldn't build a capsule for this topic right now.");
        return;
      }
      setData((await r.json()) as CapsuleResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRegenerating(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  const cap = data?.capsule;

  return (
    <VidyaShell
      crumbs="PRACTICE · REVISION CAPSULE"
      title={title ? `Capsule — ${title}` : "Revision Capsule"}
      subtitle="A one-page, exam-ready summary distilled from this topic's questions. Skim it in the last few minutes before a test."
      actions={
        <button
          type="button"
          className="vidya-shell__primary"
          disabled={regenerating}
          onClick={() => load(true)}
          title="Rebuild the capsule from the latest questions"
        >
          {regenerating ? "Regenerating…" : "↻ Regenerate"}
        </button>
      }
    >
      <div style={{ maxWidth: 760 }}>
        {error && (
          <div role="alert" style={alertStyle}>
            {error}
          </div>
        )}

        {!cap && !error && <p style={{ color: "var(--ink-3)" }}>Building your capsule…</p>}

        {cap && (
          <>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink)" }}>{cap.summary}</p>

            <Section title="Key points" items={cap.key_points} />
            {cap.formulas.length > 0 && <Section title="Formulas & definitions" items={cap.formulas} mono />}
            <Section title="Common mistakes" items={cap.common_mistakes} tone="bad" />
            <Section title="Quick review" items={cap.quick_review} tone="accent" />

            <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: "var(--sp-5)" }}>
              Distilled from {data?.sourceCount ?? 0} published question
              {data?.sourceCount === 1 ? "" : "s"}
              {data?.cached ? " · cached" : ""}. AI-generated — verify anything critical.
            </p>
          </>
        )}
      </div>
    </VidyaShell>
  );
}

function Section({
  title,
  items,
  tone,
  mono,
}: {
  title: string;
  items: string[];
  tone?: "bad" | "accent";
  mono?: boolean;
}) {
  if (!items || items.length === 0) return null;
  const dot =
    tone === "bad" ? "var(--bad)" : tone === "accent" ? "var(--accent, #A78BFA)" : "var(--ink-3)";
  return (
    <section style={{ marginTop: "var(--sp-5)" }}>
      <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-3)", margin: "0 0 8px" }}>
        {title}
      </h3>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={{ color: dot, flexShrink: 0 }}>▪</span>
            <span
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--ink-2)",
                fontFamily: mono ? "var(--font-mono, ui-monospace, monospace)" : undefined,
              }}
            >
              {it}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const alertStyle: CSSProperties = {
  padding: "var(--sp-3) var(--sp-4)",
  marginBottom: "var(--sp-4)",
  background: "var(--card)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--ink-2)",
};
