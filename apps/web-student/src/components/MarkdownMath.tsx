import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// ──────────────────────────────────────────────────────────────────────
// MarkdownMath — a small, shared markdown + LaTeX renderer.
//
// Quiz explanations are NEET/JEE-heavy: formulas, subscripts, bold key
// terms, numbered worked-example steps, and bullet lists. The teaching-note
// pipeline now emits Markdown + LaTeX, so we render both: GFM markdown
// (bold/italic/lists/tables) + KaTeX math.
//
// Block mode (default) renders real <p>/<ul>/<ol>/<li> so lists and steps
// stack vertically with proper spacing — the demarcation the old inline
// rendering flattened. Inline mode collapses the wrapping <p> into a <span>
// for use inside a sentence (e.g. a per-option verdict).
//
// The same auto-detect heuristic as pages/Quiz.tsx's MathText: if the text
// carries LaTeX-ish markers but no dollar signs, wrap it in inline math.
//
// pages/Quiz.tsx (MathText) and components/TutorMessage.tsx (TutorMarkdown)
// predate this and could consolidate onto it later.
// ──────────────────────────────────────────────────────────────────────

const blockComponents: Components = {
  p: ({ children }) => (
    <p style={{ margin: "0 0 8px", lineHeight: 1.7 }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul style={{ margin: "6px 0", paddingLeft: 20 }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: "6px 0", paddingLeft: 22 }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{ margin: "0 0 6px", lineHeight: 1.6 }}>{children}</li>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700 }}>{children}</strong>
  ),
  em: ({ children }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
  h1: ({ children }) => (
    <h4 style={{ margin: "6px 0", fontSize: 14, fontWeight: 700 }}>{children}</h4>
  ),
  h2: ({ children }) => (
    <h4 style={{ margin: "6px 0", fontSize: 14, fontWeight: 700 }}>{children}</h4>
  ),
  h3: ({ children }) => (
    <h4 style={{ margin: "6px 0", fontSize: 13, fontWeight: 700 }}>{children}</h4>
  ),
  code: ({ children }) => (
    <code
      style={{
        fontFamily: "var(--font-mono, monospace)",
        fontSize: "0.92em",
        background: "var(--rule)",
        borderRadius: 4,
        padding: "1px 4px",
      }}
    >
      {children}
    </code>
  ),
};

const inlineComponents: Components = {
  p: ({ children }) => <span>{children}</span>,
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700 }}>{children}</strong>
  ),
  em: ({ children }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
};

export function MarkdownMath({
  text,
  inline = false,
}: {
  text: string;
  inline?: boolean;
}) {
  const looksLikeMath =
    /\$[^$]+\$|\\[a-zA-Z]+|_\{?[a-zA-Z0-9]|\^\{?[a-zA-Z0-9]/.test(text);
  const source = looksLikeMath && !text.includes("$") ? `$${text}$` : text;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={inline ? inlineComponents : blockComponents}
    >
      {source}
    </ReactMarkdown>
  );
}
