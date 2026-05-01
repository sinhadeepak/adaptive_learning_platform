import type { ReactNode } from "react";
import type { Renderer } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Fill-in family renderers (P5-S59).
//
// Covers: FILL_BLANK_SINGLE · FILL_BLANK_MULTI · CLOZE_PASSAGE · SHORT_TEXT
//
// Stem includes blank placeholders. Single-blank uses `___`; multi
// uses {{1}}, {{2}}, ... — the renderer splits on placeholders and
// inserts <input> nodes inline.
// ─────────────────────────────────────────────────────────────────────────

export interface FillBlankSinglePayload {
  stem: string;
  match_mode?: "exact" | "case_insensitive" | "fuzzy_token";
  explanation?: string;
}

export interface FillBlankSingleResponse {
  answer: string;
}

export const FillBlankSingleRenderer: Renderer<FillBlankSinglePayload, FillBlankSingleResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  const parts = payload.stem.split(/(_{3,}|\{\{1\}\})/);
  return (
    <div>
      <p
        style={{
          fontSize: 16,
          lineHeight: 1.8,
          marginBottom: 16,
        }}
      >
        {parts.map((part, idx) => {
          if (/^_{3,}$/.test(part) || part === "{{1}}") {
            return (
              <input
                key={idx}
                type="text"
                value={value?.answer ?? ""}
                onChange={(e) =>
                  e.target.value === ""
                    ? onChange(null)
                    : onChange({ answer: e.target.value })
                }
                disabled={disabled}
                style={{
                  display: "inline-block",
                  margin: "0 4px",
                  padding: "4px 8px",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "2px solid var(--color-blue, #4f87f6)",
                  background: "transparent",
                  fontSize: "inherit",
                  fontFamily: "inherit",
                  minWidth: 100,
                }}
              />
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </p>
    </div>
  );
};

export interface FillBlankMultiPayload {
  stem: string;
  blanks: { id: string; match_mode?: string }[];
  partial_credit?: boolean;
  explanation?: string;
}

export interface FillBlankMultiResponse {
  blanks: { blank_id: string; answer: string }[];
}

export const FillBlankMultiRenderer: Renderer<FillBlankMultiPayload, FillBlankMultiResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  const answersMap = new Map<string, string>(
    (value?.blanks ?? []).map((b) => [b.blank_id, b.answer]),
  );
  function setAnswer(blankId: string, answer: string) {
    const next = new Map(answersMap);
    if (answer === "") next.delete(blankId);
    else next.set(blankId, answer);
    onChange({
      blanks: Array.from(next.entries()).map(([blank_id, a]) => ({
        blank_id,
        answer: a,
      })),
    });
  }

  // Split stem on {{n}} placeholders; render an <input> per known blank id.
  const parts = payload.stem.split(/(\{\{[^}]+\}\})/);
  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.8 }}>
        {parts.map((part, idx) => {
          const m = part.match(/^\{\{([^}]+)\}\}$/);
          if (m) {
            const blankId = m[1];
            return (
              <input
                key={idx}
                type="text"
                value={answersMap.get(blankId) ?? ""}
                onChange={(e) => setAnswer(blankId, e.target.value)}
                disabled={disabled}
                style={{
                  display: "inline-block",
                  margin: "0 4px",
                  padding: "4px 8px",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "2px solid var(--color-blue, #4f87f6)",
                  background: "transparent",
                  fontSize: "inherit",
                  fontFamily: "inherit",
                  minWidth: 80,
                }}
              />
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </p>
    </div>
  );
};

export interface ClozePassagePayload {
  passage: string;
  blanks: { id: string }[];
  word_bank?: string[] | null;
  partial_credit?: boolean;
  explanation?: string;
}

export const ClozePassageRenderer: Renderer<ClozePassagePayload, FillBlankMultiResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  // Re-use the multi-blank renderer with passage as stem.
  return (
    <div>
      {payload.word_bank && payload.word_bank.length > 0 && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: "var(--bg-subtle, #f8f9fc)",
            borderRadius: 6,
          }}
        >
          <strong>Word bank:</strong>{" "}
          {payload.word_bank.join(" · ")}
        </div>
      )}
      <FillBlankMultiRenderer
        payload={{
          stem: payload.passage,
          blanks: payload.blanks,
          partial_credit: payload.partial_credit,
        }}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
};

export interface ShortTextPayload {
  stem: string;
  expected_word_count_range?: [number, number] | null;
  key_concepts?: string[];
  explanation?: string;
}

export interface ShortTextResponse {
  text: string;
}

export const ShortTextRenderer: Renderer<ShortTextPayload, ShortTextResponse> = ({
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
      {payload.expected_word_count_range && (
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
          Aim for {payload.expected_word_count_range[0]}-
          {payload.expected_word_count_range[1]} words.
        </div>
      )}
      <textarea
        value={value?.text ?? ""}
        onChange={(e) =>
          e.target.value.trim() === ""
            ? onChange(null)
            : onChange({ text: e.target.value })
        }
        disabled={disabled}
        rows={4}
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid var(--border, #e1e5ee)",
          borderRadius: 4,
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
        {wordCount} word{wordCount === 1 ? "" : "s"}
        {payload.expected_word_count_range && wordCount > 0 && (
          <>
            {" "}·{" "}
            {wordCount < payload.expected_word_count_range[0]
              ? "below target"
              : wordCount > payload.expected_word_count_range[1]
                ? "above target"
                : "on target"}
          </>
        )}
      </div>
    </div>
  );
};
