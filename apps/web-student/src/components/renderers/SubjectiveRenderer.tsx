import type { ReactNode } from "react";
import type { Renderer } from "./types";
import { ShortTextRenderer, type ShortTextPayload, type ShortTextResponse } from "./FillInRenderer";

// ─────────────────────────────────────────────────────────────────────────
// Subjective family renderers (P5-S59).
//
// Covers: ESSAY · DESCRIPTIVE_LONG · CASE_STUDY (composite parent) ·
//          COMPREHENSION_LONG (composite parent)
//
// Composite types render the scenario / passage + a list of child
// questions (one of any type). Children render through the dispatcher
// in the parent's onChange.
// ─────────────────────────────────────────────────────────────────────────

export interface EssayPayload {
  stem: string;
  expected_word_count_range: [number, number];
  rubric?: { criteria: { id: string; text: string; weight: number }[] };
  explanation?: string;
}

export interface EssayResponse {
  text: string | null;
}

export const EssayRenderer: Renderer<EssayPayload, EssayResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  const wordCount =
    (value?.text ?? "").split(/\s+/).filter((w) => w.length > 0).length;

  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <div
        style={{
          fontSize: 12,
          opacity: 0.7,
          marginBottom: 8,
        }}
      >
        Aim for {payload.expected_word_count_range[0]}-
        {payload.expected_word_count_range[1]} words. Currently:{" "}
        <strong>{wordCount}</strong>.
      </div>
      {payload.rubric && payload.rubric.criteria.length > 0 && (
        <details
          style={{
            marginBottom: 12,
            padding: 8,
            background: "var(--bg-subtle, #f8f9fc)",
            borderRadius: 6,
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: 12 }}>
            Marking rubric ({payload.rubric.criteria.length} criteria)
          </summary>
          <ul style={{ marginTop: 6, fontSize: 12 }}>
            {payload.rubric.criteria.map((c) => (
              <li key={c.id}>
                <strong>{c.id}</strong> ({c.weight}%) — {c.text}
              </li>
            ))}
          </ul>
        </details>
      )}
      <textarea
        value={value?.text ?? ""}
        onChange={(e) =>
          e.target.value.trim() === ""
            ? onChange(null)
            : onChange({ text: e.target.value })
        }
        disabled={disabled}
        rows={12}
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid var(--border, #e1e5ee)",
          borderRadius: 4,
          fontSize: 14,
          fontFamily: "Georgia, serif",
          lineHeight: 1.6,
          resize: "vertical",
        }}
      />
    </div>
  );
};

export const DescriptiveLongRenderer = EssayRenderer;

export interface CaseStudyPayload {
  scenario: string;
  child_questions: { question_id: string; ordinal: number }[];
  explanation?: string;
}

export interface CaseStudyResponse {
  children: { question_id: string; response_payload: Record<string, unknown> }[];
}

export const CaseStudyRenderer: Renderer<CaseStudyPayload, CaseStudyResponse> = ({
  payload,
}): ReactNode => {
  // Composite parent — children are referenced by question_id and
  // render through their own handler in the Quiz page. We surface the
  // scenario + the child manifest so the Quiz page knows to fetch the
  // child payloads and dispatch appropriate renderers.
  return (
    <div>
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Scenario</h3>
      <div
        style={{
          padding: 16,
          background: "var(--bg-subtle, #f8f9fc)",
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 14,
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
        }}
      >
        {payload.scenario}
      </div>
      <div
        style={{
          fontSize: 13,
          opacity: 0.8,
          padding: 8,
          background: "var(--color-blue-bg, #dbeafe)",
          borderRadius: 4,
        }}
      >
        Read the scenario, then answer the {payload.child_questions.length} sub-
        question{payload.child_questions.length === 1 ? "" : "s"} that follow.
        The Quiz page will dispatch each child's renderer in turn.
      </div>
    </div>
  );
};

export interface ComprehensionLongPayload {
  passage: string;
  child_questions: { question_id: string; ordinal: number }[];
  explanation?: string;
}

export const ComprehensionLongRenderer: Renderer<
  ComprehensionLongPayload,
  CaseStudyResponse
> = ({ payload }): ReactNode => {
  return (
    <div>
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Passage</h3>
      <div
        style={{
          padding: 16,
          background: "var(--bg-subtle, #f8f9fc)",
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 14,
          lineHeight: 1.7,
          fontFamily: "Georgia, serif",
          maxHeight: 400,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {payload.passage}
      </div>
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        Read the passage, then answer the {payload.child_questions.length} sub-
        question{payload.child_questions.length === 1 ? "" : "s"} that follow.
      </div>
    </div>
  );
};

// Re-export ShortText since it's logically subjective family but
// shares the AI_ASSISTED evaluation path.
export { ShortTextRenderer };
export type { ShortTextPayload, ShortTextResponse };
