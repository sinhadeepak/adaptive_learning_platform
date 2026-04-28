import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Tutor reply rendering — shared between AITutorChat (TopicDetail page) and
// Experts (full-page chat). Two responsibilities:
//
//   1. parseTutorReply — splits the raw model text into a Markdown body
//      and a list of generative-UI follow-up suggestions. The model is
//      instructed (see services/adaptive-engine/src/adaptive_engine/tutor.py
//      SYSTEM_TEMPLATE) to emit a fenced block of the form:
//
//         <<FOLLOWUPS>>
//         - Question 1
//         - Question 2
//         <<END>>
//
//      Anything before the opening marker is the visible response. If the
//      stream hasn't reached the closing marker yet (mid-stream), we show
//      the body up to the opening marker and hold off on chips until close.
//
//   2. <TutorMarkdown> — renders the body with react-markdown + GFM, with
//      compact spacing tuned for chat bubbles.
//
//   3. <TutorFollowups> — renders the suggestion chips. Click → calls the
//      `onPick` callback with the suggestion text, which the parent uses
//      to auto-send a follow-up turn.

const FOLLOWUPS_OPEN = "<<FOLLOWUPS>>";
const FOLLOWUPS_CLOSE = "<<END>>";

export type ArtifactType = "concept_card" | "formula_card" | "quick_quiz";

export interface TutorArtifact {
  type: ArtifactType;
  data: Record<string, unknown>;
  // Position in the original body where this artifact should be inlined.
  // We replace the marker block with a sentinel `<<INLINE_ARTIFACT_n>>` so
  // the renderer can split the body and inject the card.
  marker: string;
}

export interface ParsedTutorReply {
  body: string;
  followups: string[];
  artifacts: TutorArtifact[];
}

const ARTIFACT_OPEN = /<<ARTIFACT\s+type="([a-z_]+)"\s*>>/g;
const ARTIFACT_CLOSE = "<<END>>";

/**
 * Strip <<ARTIFACT type="..."JSON<<END>>> blocks from the body and replace
 * each with a placeholder marker. Returns the parsed artifacts in order.
 *
 * Streaming-safe: if the closing <<END>> hasn't arrived yet, leave the
 * partial block as-is in the body so the user sees something flowing.
 */
function extractArtifacts(raw: string): { body: string; artifacts: TutorArtifact[] } {
  const artifacts: TutorArtifact[] = [];
  let body = "";
  let cursor = 0;
  let n = 0;

  // We can't use replace with a stateful regex easily because the close marker
  // is shared with FOLLOWUPS. Walk manually.
  while (true) {
    ARTIFACT_OPEN.lastIndex = cursor;
    const match = ARTIFACT_OPEN.exec(raw);
    if (!match) {
      body += raw.slice(cursor);
      break;
    }
    const openIdx = match.index;
    body += raw.slice(cursor, openIdx);
    const type = match[1] as ArtifactType;
    const afterOpen = openIdx + match[0].length;
    const closeIdx = raw.indexOf(ARTIFACT_CLOSE, afterOpen);
    if (closeIdx < 0) {
      // Mid-stream — leave the partial block in the body, stop parsing.
      body += raw.slice(openIdx);
      cursor = raw.length;
      break;
    }
    const json = raw.slice(afterOpen, closeIdx).trim();
    let data: Record<string, unknown> | null = null;
    try {
      data = JSON.parse(json);
    } catch {
      // Malformed JSON — emit a small inline notice rather than the raw block.
      data = null;
    }
    const marker = `<<INLINE_ARTIFACT_${n}>>`;
    n += 1;
    if (data && (type === "concept_card" || type === "formula_card" || type === "quick_quiz")) {
      artifacts.push({ type, data, marker });
      body += `\n\n${marker}\n\n`;
    }
    cursor = closeIdx + ARTIFACT_CLOSE.length;
  }
  return { body, artifacts };
}

export function parseTutorReply(raw: string): ParsedTutorReply {
  // 1. Extract followups first (always at end).
  const open = raw.indexOf(FOLLOWUPS_OPEN);
  let bodyRaw = raw;
  let followups: string[] = [];
  if (open >= 0) {
    bodyRaw = raw.slice(0, open).trimEnd();
    const close = raw.indexOf(FOLLOWUPS_CLOSE, open);
    if (close >= 0) {
      const inner = raw.slice(open + FOLLOWUPS_OPEN.length, close);
      followups = inner
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("-"))
        .map((line) => line.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
        .map((s) => s.replace(/^["']|["']$/g, "").trim())
        .slice(0, 4);
    }
  }
  // 2. Extract artifacts from the remaining body.
  const { body, artifacts } = extractArtifacts(bodyRaw);
  return { body, followups, artifacts };
}

export function TutorMarkdown({ children }: { children: string }): ReactNode {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        // Compact spacing tuned for chat bubbles.
        p: ({ children: c }) => <p className="md-p">{c}</p>,
        ul: ({ children: c }) => <ul className="md-ul">{c}</ul>,
        ol: ({ children: c }) => <ol className="md-ol">{c}</ol>,
        li: ({ children: c }) => <li className="md-li">{c}</li>,
        h1: ({ children: c }) => <h3 className="md-h">{c}</h3>,
        h2: ({ children: c }) => <h3 className="md-h">{c}</h3>,
        h3: ({ children: c }) => <h4 className="md-h">{c}</h4>,
        blockquote: ({ children: c }) => <blockquote className="md-bq">{c}</blockquote>,
        // Distinguish inline `code` from block ``` fences.
        code: ({ className, children: c, ...rest }) => {
          const isBlock = /language-/.test(className ?? "");
          if (isBlock) {
            return (
              <pre className="md-pre">
                <code {...rest}>{c}</code>
              </pre>
            );
          }
          return (
            <code className="md-code-inline" {...rest}>
              {c}
            </code>
          );
        },
        a: ({ children: c, ...rest }) => (
          <a target="_blank" rel="noreferrer" className="md-link" {...rest}>
            {c}
          </a>
        ),
        table: ({ children: c }) => (
          <div className="md-table-wrap">
            <table className="md-table">{c}</table>
          </div>
        ),
        hr: () => <hr className="md-hr" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Generative-UI artifact renderer
//
// `parseTutorReply` returns the body with `<<INLINE_ARTIFACT_n>>` placeholders
// where each artifact should render. `TutorBody` splits the body around these
// markers and injects the right card component inline.
// ──────────────────────────────────────────────────────────────────────

export function TutorBody({
  reply,
  onQuickQuizAnswer,
}: {
  reply: ParsedTutorReply;
  onQuickQuizAnswer?: (correct: boolean) => void;
}): ReactNode {
  if (reply.artifacts.length === 0) return <TutorMarkdown>{reply.body}</TutorMarkdown>;

  const segments: ReactNode[] = [];
  let cursor = 0;
  reply.artifacts.forEach((art, i) => {
    const idx = reply.body.indexOf(art.marker, cursor);
    if (idx < 0) return;
    if (idx > cursor) {
      segments.push(<TutorMarkdown key={`md-${i}`}>{reply.body.slice(cursor, idx)}</TutorMarkdown>);
    }
    segments.push(<TutorArtifactCard key={`art-${i}`} artifact={art} onQuickQuizAnswer={onQuickQuizAnswer} />);
    cursor = idx + art.marker.length;
  });
  if (cursor < reply.body.length) {
    segments.push(<TutorMarkdown key={`md-tail`}>{reply.body.slice(cursor)}</TutorMarkdown>);
  }
  return <>{segments}</>;
}

function TutorArtifactCard({
  artifact,
  onQuickQuizAnswer,
}: {
  artifact: TutorArtifact;
  onQuickQuizAnswer?: (correct: boolean) => void;
}): ReactNode {
  switch (artifact.type) {
    case "concept_card":
      return <ConceptCard data={artifact.data} />;
    case "formula_card":
      return <FormulaCard data={artifact.data} />;
    case "quick_quiz":
      return <QuickQuizCard data={artifact.data} onAnswer={onQuickQuizAnswer} />;
    default:
      return null;
  }
}

function ConceptCard({ data }: { data: Record<string, unknown> }): ReactNode {
  const title = (data.title ?? "") as string;
  const summary = (data.summary ?? "") as string;
  const points = (data.key_points ?? []) as string[];
  return (
    <div
      style={{
        margin: "10px 0",
        padding: "12px 14px",
        background: "rgba(34,212,238,0.06)",
        border: "1px solid rgba(34,212,238,0.25)",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ color: "var(--color-ai)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
          ◈ CONCEPT
        </span>
      </div>
      {title ? (
        <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
          {title}
        </div>
      ) : null}
      {points.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
          {points.map((p, i) => (
            <li key={i} style={{ marginBottom: 2 }}>
              {p}
            </li>
          ))}
        </ul>
      ) : null}
      {summary ? (
        <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 12, fontStyle: "italic" }}>
          {summary}
        </div>
      ) : null}
    </div>
  );
}

function FormulaCard({ data }: { data: Record<string, unknown> }): ReactNode {
  const name = (data.name ?? "Formula") as string;
  const formula = (data.formula ?? "") as string;
  const variables = (data.variables ?? []) as Array<{ sym?: string; meaning?: string }>;
  const example = (data.example ?? "") as string;
  return (
    <div
      style={{
        margin: "10px 0",
        padding: "12px 14px",
        background: "rgba(167,139,250,0.06)",
        border: "1px solid rgba(167,139,250,0.30)",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "var(--color-purple)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
          ◈ FORMULA
        </span>
        <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 13 }}>{name}</span>
      </div>
      {formula ? (
        <div
          style={{
            background: "var(--bg-surface3)",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 8,
            fontFamily: "monospace",
            fontSize: 14,
            color: "var(--color-purple)",
            overflowX: "auto",
          }}
        >
          {/* The model puts LaTeX in `formula` (e.g. KE = \frac{1}{2}mv^2).
              We render it through the markdown stack so KaTeX kicks in. */}
          <TutorMarkdown>{`$$${formula}$$`}</TutorMarkdown>
        </div>
      ) : null}
      {variables.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: example ? 8 : 0 }}>
          {variables.map((v, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--color-ai)", marginRight: 6 }}>{v.sym}</strong>
              {v.meaning}
            </div>
          ))}
        </div>
      ) : null}
      {example ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            paddingTop: 6,
            borderTop: "1px solid var(--border-default)",
          }}
        >
          <strong style={{ color: "var(--color-green)" }}>Example: </strong>
          {example}
        </div>
      ) : null}
    </div>
  );
}

function QuickQuizCard({
  data,
  onAnswer,
}: {
  data: Record<string, unknown>;
  onAnswer?: (correct: boolean) => void;
}): ReactNode {
  const question = (data.question ?? "") as string;
  const choices = (data.choices ?? []) as string[];
  const correctIdx = ((data.correct_idx ?? 0) as number);
  const explanation = (data.explanation ?? "") as string;

  // Local state via useState. We're inside ReactMarkdown but this is a
  // top-level component when invoked, so hooks are fine.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [picked, setPicked] = useState<number | null>(null);

  const showFeedback = picked !== null;
  const isCorrect = picked === correctIdx;

  return (
    <div
      style={{
        margin: "10px 0",
        padding: "12px 14px",
        background: "rgba(245,166,35,0.06)",
        border: "1px solid rgba(245,166,35,0.30)",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ color: "var(--color-amber)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
          ◈ QUICK CHECK
        </span>
      </div>
      {question ? (
        <div style={{ color: "var(--text-primary)", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
          {question}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {choices.map((c, i) => {
          const isPicked = picked === i;
          const isAnsCorrect = i === correctIdx;
          let bg = "var(--bg-surface3)";
          let bd = "var(--border-default)";
          if (showFeedback) {
            if (isAnsCorrect) {
              bg = "rgba(16,196,122,0.15)";
              bd = "var(--color-green)";
            } else if (isPicked) {
              bg = "rgba(244,63,94,0.15)";
              bd = "var(--color-red)";
            }
          } else if (isPicked) {
            bg = "rgba(79,135,246,0.15)";
            bd = "var(--color-blue)";
          }
          return (
            <button
              key={i}
              onClick={() => {
                if (picked !== null) return;
                setPicked(i);
                onAnswer?.(i === correctIdx);
              }}
              disabled={picked !== null}
              style={{
                background: bg,
                border: `1px solid ${bd}`,
                color: "var(--text-primary)",
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 12,
                cursor: picked === null ? "pointer" : "default",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: 11 }}>
                {String.fromCharCode(65 + i)}
              </span>
              <span>{c}</span>
              {showFeedback && isAnsCorrect ? (
                <span style={{ marginLeft: "auto", color: "var(--color-green)" }}>✓</span>
              ) : null}
              {showFeedback && isPicked && !isAnsCorrect ? (
                <span style={{ marginLeft: "auto", color: "var(--color-red)" }}>✗</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {showFeedback ? (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            background: isCorrect ? "rgba(16,196,122,0.08)" : "rgba(244,63,94,0.08)",
            borderLeft: `2px solid ${isCorrect ? "var(--color-green)" : "var(--color-red)"}`,
            borderRadius: 4,
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: isCorrect ? "var(--color-green)" : "var(--color-red)" }}>
            {isCorrect ? "Correct! " : "Not quite — "}
          </strong>
          {explanation}
        </div>
      ) : null}
    </div>
  );
}

export function TutorFollowups({
  items,
  onPick,
  disabled,
}: {
  items: string[];
  onPick: (text: string) => void;
  disabled?: boolean;
}): ReactNode {
  if (items.length === 0) return null;
  return (
    <div className="tutor-fu" role="group" aria-label="Suggested follow-up questions">
      <div className="tutor-fu-label">
        <span className="tutor-fu-label-glyph" aria-hidden>
          ✦
        </span>
        Continue the conversation
      </div>
      <div className="tutor-fu-chips">
        {items.map((q, i) => (
          <button
            key={i}
            type="button"
            className="tutor-fu-chip"
            disabled={disabled}
            onClick={() => onPick(q)}
            title={q}
          >
            <span className="tutor-fu-chip-icon" aria-hidden>
              ↳
            </span>
            <span className="tutor-fu-chip-text">{q}</span>
            <span className="tutor-fu-chip-arrow" aria-hidden>
              →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
