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
  stem?: string;
  // Legacy seed shape — the field is named `template` and uses
  // `[BLANK]` placeholders. Accepting either shape keeps the renderer
  // tolerant against the unmigrated content_schema fixtures.
  template?: string;
  match_mode?: "exact" | "case_insensitive" | "fuzzy_token";
  explanation?: string;
}

export interface FillBlankSingleResponse {
  answer: string;
}

// Escape a string so it can be embedded verbatim in a RegExp source.
function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const FillBlankSingleRenderer: Renderer<FillBlankSinglePayload, FillBlankSingleResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  // Split on every supported placeholder syntax: `___+`, `{{1}}`,
  // `[BLANK]`. Using `?? ""` defends against fully missing text so the
  // renderer never crashes on a partial payload — at worst we draw an
  // empty input.
  let text = payload.stem ?? payload.template ?? "";

  // Seed-data repair: some legacy fill-in-the-blank rows ship a
  // template *without* a `[BLANK]` marker — the author wrote the full
  // sentence and listed `accepted: [["word"]]` separately. Auto-mask
  // the first occurrence of the canonical answer so the student sees
  // a real blank. Case-insensitive, whole-word match; no-op when the
  // template already contains a placeholder or no word matches.
  const hasPlaceholder = /_{3,}|\{\{1\}\}|\[BLANK\]/.test(text);
  const accepted = (payload as { accepted?: unknown }).accepted;
  const firstAccepted: string | null = Array.isArray(accepted)
    ? typeof accepted[0] === "string"
      ? (accepted[0] as string)
      : Array.isArray(accepted[0]) && typeof (accepted[0] as unknown[])[0] === "string"
      ? ((accepted[0] as unknown[])[0] as string)
      : null
    : null;
  if (!hasPlaceholder && firstAccepted) {
    const re = new RegExp(`\\b${escapeReg(firstAccepted)}\\b`, "i");
    if (re.test(text)) {
      text = text.replace(re, "[BLANK]");
    }
  }

  const parts = text.split(/(_{3,}|\{\{1\}\}|\[BLANK\])/);
  const finalHasBlank = /_{3,}|\{\{1\}\}|\[BLANK\]/.test(text);
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
          if (/^_{3,}$/.test(part) || part === "{{1}}" || part === "[BLANK]") {
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
                  borderBottom: "2px solid var(--info, #4f87f6)",
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
      {!finalHasBlank && (
        // Author shipped a stem without a blank marker AND no
        // accepted-answer hint we could auto-mask. Show a free-form
        // input below so the student can still submit something.
        <div style={{ marginTop: 12 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ink-3)",
              marginBottom: 6,
            }}
            htmlFor="fb-single-fallback"
          >
            Your answer
          </label>
          <input
            id="fb-single-fallback"
            type="text"
            value={value?.answer ?? ""}
            onChange={(e) =>
              e.target.value === ""
                ? onChange(null)
                : onChange({ answer: e.target.value })
            }
            disabled={disabled}
            placeholder="Type your answer here"
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "8px 12px",
              border: "1px solid var(--rule)",
              borderRadius: 6,
              background: "var(--paper-2)",
              fontSize: 14,
              color: "var(--ink)",
            }}
          />
        </div>
      )}
    </div>
  );
};

export interface FillBlankMultiPayload {
  stem?: string;
  // Legacy: seeds ship `template` with `[BLANK]` placeholders + an
  // `accepted: [[...synonyms...]]` list. Renderer reads either shape.
  template?: string;
  blanks?: { id: string; match_mode?: string }[];
  accepted?: string[][];
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

  // Split stem on every supported placeholder syntax. The seed shape
  // uses `[BLANK]` with no explicit ids, so when we hit one we mint a
  // synthetic blank_id (`b0`, `b1`, …) for the answer map.
  let text = payload.stem ?? payload.template ?? "";

  // Seed-data repair: if the template lacks any `[BLANK]` markers
  // but the `accepted: [[...],[...]]` array still describes multiple
  // blanks, mask the first occurrence of each accepted-set's first
  // synonym so the inline inputs are still drawn. No-op when the
  // template already contains placeholders.
  const hasPlaceholder = /\{\{[^}]+\}\}|\[BLANK\]/.test(text);
  if (!hasPlaceholder && Array.isArray(payload.accepted)) {
    for (const synonyms of payload.accepted) {
      const word = Array.isArray(synonyms) ? synonyms[0] : null;
      if (typeof word !== "string" || word.length === 0) continue;
      const re = new RegExp(`\\b${escapeReg(word)}\\b`, "i");
      if (re.test(text)) text = text.replace(re, "[BLANK]");
    }
  }

  const parts = text.split(/(\{\{[^}]+\}\}|\[BLANK\])/);
  const finalHasBlank = /\{\{[^}]+\}\}|\[BLANK\]/.test(text);
  let blankSeq = 0;
  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.8 }}>
        {parts.map((part, idx) => {
          const m = part.match(/^\{\{([^}]+)\}\}$/);
          if (m || part === "[BLANK]") {
            const blankId = m ? m[1] : `b${blankSeq++}`;
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
                  borderBottom: "2px solid var(--info, #4f87f6)",
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
      {!finalHasBlank && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
            Your answers
          </span>
          {(payload.accepted ?? [["b0"]]).map((_, i) => {
            const id = `b${i}`;
            return (
              <input
                key={id}
                type="text"
                value={answersMap.get(id) ?? ""}
                onChange={(e) => setAnswer(id, e.target.value)}
                disabled={disabled}
                placeholder={`Answer ${i + 1}`}
                style={{
                  maxWidth: 360,
                  padding: "6px 10px",
                  border: "1px solid var(--rule)",
                  borderRadius: 6,
                  background: "var(--paper-2)",
                  fontSize: 13,
                  color: "var(--ink)",
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export interface ClozePassagePayload {
  passage?: string;
  // Legacy: seeds ship `template` instead of `passage`, no explicit
  // `blanks` list, and an `accepted: [[...synonyms...]]` array.
  template?: string;
  blanks?: { id: string }[];
  accepted?: string[][];
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
            background: "var(--paper-2, #f8f9fc)",
            borderRadius: 6,
          }}
        >
          <strong>Word bank:</strong>{" "}
          {payload.word_bank.join(" · ")}
        </div>
      )}
      <FillBlankMultiRenderer
        payload={{
          stem: payload.passage ?? payload.template,
          template: payload.template,
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
          border: "1px solid var(--rule, #e1e5ee)",
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