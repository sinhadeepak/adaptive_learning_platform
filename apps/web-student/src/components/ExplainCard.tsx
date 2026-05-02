import { useEffect, useState } from "react";
import { auth } from "../lib/api";
import { ResourceShelf } from "./ResourceShelf";

// ─────────────────────────────────────────────────────────────────────────
// ExplainCard (v2 — rich, structured, video-linked)
//
// Renders the canonical teaching note for one quiz item. The v2 schema is
// self-contained: headline + key_concept + why_correct + per-option
// verdicts + common_pitfall + worked_example + next_steps. The same note
// is served to every student who hits the same question (cached
// per-question on the server), so writing it well pays off across the
// whole cohort.
//
// Order of preference for the body:
//   1. Stored authored explanation (legacy plain text from Quiz)
//   2. v2 rich payload from /adaptive/explain (typical path)
//   3. v1 plain text fallback (older cached rows / heuristic mode)
//
// The card *always* renders something — a quiz item without a teaching
// note is the regression we're fighting.
// ─────────────────────────────────────────────────────────────────────────

interface ExplainCardProps {
  itemIdx: number;
  questionId: string;
  topicId?: string;
  stem?: string;
  choices?: string[];
  correctIdx?: number;
  pickedIdx?: number;
  answered: boolean;
  isCorrect?: boolean;
  storedExplanation?: string | null;
  topicTitle?: string;
}

interface OptionVerdict {
  id: string;
  is_correct: boolean;
  verdict: string;
}

interface ExplainResponse {
  // v2 rich fields (present on AI cache hit/miss; absent on heuristic)
  headline?: string;
  key_concept?: string;
  why_correct?: string;
  options?: OptionVerdict[];
  common_pitfall?: string;
  worked_example?: string;
  next_steps?: string[];
  // v1 legacy fields (still populated for backward compat)
  explanation: string;
  source: "ai" | "heuristic";
  cache?: "hit" | "miss";
  model?: string | null;
  prompt_template_id?: string | null;
  prompt_template_version?: string | null;
}

export function ExplainCard({
  itemIdx,
  questionId,
  topicId,
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
  const [showWorkedExample, setShowWorkedExample] = useState(false);

  // Auto-fetch when no stored explanation exists and the student got it wrong.
  useEffect(() => {
    if (storedExplanation) return;
    if (generated || loading || !stem || !choices || correctIdx === undefined) return;
    if (answered && isCorrect) return;
    void fetchExplanation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedExplanation, stem, choices, correctIdx, answered, isCorrect]);

  async function fetchExplanation() {
    setLoading(true);
    setRequested(true);
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
          questionId,
        }),
      });
      if (r.ok) setGenerated((await r.json()) as ExplainResponse);
    } catch {
      /* swallow — the card just hides the generated portion */
    } finally {
      setLoading(false);
    }
  }

  if (!storedExplanation && !stem) return null;

  // Stored authored explanation — render simple inline note.
  if (storedExplanation) {
    return (
      <div style={cardStyle}>
        <div style={eyebrowRow}>
          <span style={eyebrowMuted}>Q{itemIdx + 1} · teaching note</span>
          <span style={badgeAuthored}>◈ Authored</span>
        </div>
        <p style={bodyText}>{storedExplanation}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={eyebrowMuted}>Q{itemIdx + 1} · generating teaching note…</div>
        <div style={{ marginTop: 8, height: 12, background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
        <div style={{ marginTop: 6, height: 12, width: "80%", background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
        <div style={{ marginTop: 6, height: 12, width: "60%", background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
      </div>
    );
  }

  if (!generated) {
    return (
      <div style={cardStyle}>
        <button
          type="button"
          onClick={() => void fetchExplanation()}
          disabled={requested}
          style={triggerButton}
        >
          ✦ Explain this answer
        </button>
      </div>
    );
  }

  const isRich =
    generated.headline !== undefined &&
    Array.isArray(generated.options) &&
    generated.options.length > 0;
  const correctText =
    correctIdx !== undefined && choices ? choices[correctIdx] : null;

  return (
    <div style={cardStyle}>
      {/* ── Header row: key concept + source pill ──────────────────── */}
      <div style={eyebrowRow}>
        <div style={eyebrowKey}>
          ✦ {generated.key_concept || "Teaching note"}
        </div>
        <SourceBadge generated={generated} />
      </div>

      {isRich ? (
        <>
          {/* ── Headline ──────────────────────────────────────── */}
          <h3 style={headlineStyle}>{generated.headline}</h3>

          {/* ── Why correct ──────────────────────────────────── */}
          {generated.why_correct && (
            <Section label="Why this is correct">
              <p style={bodyText}>{generated.why_correct}</p>
            </Section>
          )}

          {/* ── Per-option verdicts ──────────────────────────── */}
          {generated.options && generated.options.length > 0 && (
            <Section label="Each option, briefly">
              <ul style={optionList}>
                {generated.options.map((o, i) => {
                  const choiceText = choices?.[i];
                  return (
                    <li
                      key={o.id}
                      style={{
                        ...optionRow,
                        borderColor: o.is_correct
                          ? "rgba(16,196,122,0.35)"
                          : "rgba(244,63,94,0.20)",
                        background: o.is_correct
                          ? "rgba(16,196,122,0.05)"
                          : "rgba(244,63,94,0.04)",
                      }}
                    >
                      <span style={optionMark}>
                        <span style={optionId}>{o.id}.</span>
                        <span
                          style={{
                            color: o.is_correct
                              ? "var(--color-green, #10C47A)"
                              : "var(--color-red, #F43F5E)",
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {o.is_correct ? "✓" : "✗"}
                        </span>
                      </span>
                      <span style={optionBody}>
                        {choiceText && (
                          <span style={{ color: "var(--text-secondary, #B8C5E0)" }}>
                            "{choiceText}" —{" "}
                          </span>
                        )}
                        {o.verdict}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {/* ── Common pitfall (callout) ─────────────────────── */}
          {generated.common_pitfall && (
            <div style={pitfallCallout}>
              <div style={pitfallHeader}>⚠ Common pitfall</div>
              <p style={pitfallBody}>{generated.common_pitfall}</p>
            </div>
          )}

          {/* ── Worked example (collapsible) ─────────────────── */}
          {generated.worked_example && generated.worked_example.trim() && (
            <Section label="">
              <button
                type="button"
                onClick={() => setShowWorkedExample((v) => !v)}
                style={collapseToggle}
              >
                {showWorkedExample ? "▾" : "▸"} Worked example
              </button>
              {showWorkedExample && (
                <p
                  style={{
                    ...bodyText,
                    marginTop: 8,
                    padding: "10px 12px",
                    background: "rgba(34,212,238,0.05)",
                    borderRadius: 6,
                    borderLeft: "2px solid var(--color-ai, #22D4EE)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {generated.worked_example}
                </p>
              )}
            </Section>
          )}

          {/* ── Watch & Learn (curated videos for this question) ── */}
          <ResourceShelf
            questionId={questionId}
            topicId={topicId}
            title="Watch & Learn"
            subtitle={
              correctText
                ? `Curated clips for "${generated.key_concept || "this concept"}".`
                : "Curated clips your teachers pinned for this concept."
            }
            compact
            limit={6}
            hideWhenEmpty={false}
          />

          {/* ── Next steps ───────────────────────────────────── */}
          {generated.next_steps && generated.next_steps.length > 0 && (
            <Section label="Next steps">
              <ul style={nextStepsList}>
                {generated.next_steps.map((s, i) => (
                  <li key={i} style={nextStepItem}>
                    <span style={{ color: "var(--color-green, #10C47A)" }}>→</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : (
        // ── v1 fallback (legacy rows, heuristic mode) ──
        <>
          <p style={bodyText}>{generated.explanation}</p>
          {generated.common_pitfall && (
            <p style={{ ...bodyText, fontSize: 12, marginTop: 6, opacity: 0.85 }}>
              <strong>Pitfall:</strong> {generated.common_pitfall}
            </p>
          )}
          {generated.key_concept && (
            <p style={{ ...bodyText, fontSize: 11, marginTop: 4, opacity: 0.7 }}>
              Concept: {generated.key_concept}
            </p>
          )}
        </>
      )}

      {/* ── Transparency footer ──────────────────────────────── */}
      <div style={footerRow}>
        {generated.prompt_template_id && (
          <span>
            {generated.model ?? "ai"} · {generated.prompt_template_id}@
            {generated.prompt_template_version}
          </span>
        )}
        {generated.cache && (
          <span style={{ marginLeft: 8 }}>· cache: {generated.cache}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      {label && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "var(--text-faint, #7A8BAD)",
            marginBottom: 6,
          }}
        >
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function SourceBadge({ generated }: { generated: ExplainResponse }) {
  if (generated.source === "ai") {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: "var(--color-ai, #22D4EE)",
        }}
      >
        ✨ AI
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        color: "var(--text-faint, #7A8BAD)",
      }}
    >
      ◈ Heuristic
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Styles (inline for portability with the existing card system)
// ─────────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 16,
  background:
    "linear-gradient(180deg, rgba(34,212,238,0.04), rgba(12,20,34,0.6))",
  border: "1px solid rgba(34,212,238,0.18)",
  borderRadius: 10,
  color: "var(--text-primary, #EEF2FF)",
};

const eyebrowRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
};

const eyebrowMuted: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-faint, #7A8BAD)",
};

const eyebrowKey: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: "var(--color-ai, #22D4EE)",
  textTransform: "uppercase",
};

const badgeAuthored: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--color-green, #10C47A)",
};

const headlineStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.4,
  margin: "4px 0 10px",
  color: "var(--text-primary, #EEF2FF)",
};

const bodyText: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  margin: 0,
  color: "var(--text-secondary, #B8C5E0)",
};

const optionList: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const optionRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "8px 12px",
  border: "1px solid",
  borderRadius: 6,
  alignItems: "flex-start",
  fontSize: 13,
  lineHeight: 1.5,
};

const optionMark: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexShrink: 0,
  minWidth: 30,
};

const optionId: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 12,
  color: "var(--text-faint, #7A8BAD)",
};

const optionBody: React.CSSProperties = {
  flex: 1,
  color: "var(--text-secondary, #B8C5E0)",
};

const pitfallCallout: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 14px",
  background: "rgba(245,166,35,0.06)",
  border: "1px solid rgba(245,166,35,0.25)",
  borderRadius: 6,
};

const pitfallHeader: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "var(--color-amber, #F5A623)",
  marginBottom: 4,
};

const pitfallBody: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  margin: 0,
  color: "var(--text-secondary, #B8C5E0)",
};

const collapseToggle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-ai, #22D4EE)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};

const nextStepsList: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const nextStepItem: React.CSSProperties = {
  display: "flex",
  gap: 8,
  fontSize: 13,
  color: "var(--text-secondary, #B8C5E0)",
};

const triggerButton: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-ai, #22D4EE)",
  color: "var(--color-ai, #22D4EE)",
  padding: "6px 14px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const footerRow: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 8,
  borderTop: "1px solid rgba(255,255,255,0.05)",
  fontSize: 10,
  color: "var(--text-faint, #7A8BAD)",
  fontFamily: "var(--font-mono, monospace)",
  display: "flex",
  flexWrap: "wrap",
};
