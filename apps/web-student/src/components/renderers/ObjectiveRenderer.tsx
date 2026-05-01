import type { ReactNode } from "react";
import type { Renderer } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Objective family renderers (P5-S59).
//
// Covers: MCQ_SINGLE · MCQ_MULTI · TRUE_FALSE · ASSERTION_REASON ·
//          MULTI_STATEMENT
//
// All five share a common "stem + clickable options" layout. The
// renderer reads the question_type discriminator + branches on shape.
// ─────────────────────────────────────────────────────────────────────────

interface MCQOption {
  id: string;
  text: string;
}

export interface MCQSinglePayload {
  stem: string;
  options: MCQOption[];
  correct_id?: string;  // not visible to student; included only when post-grade
  explanation?: string;
}

export interface MCQSingleResponse {
  selected_id: string;
}

export const MCQSingleRenderer: Renderer<MCQSinglePayload, MCQSingleResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {payload.options.map((opt) => {
          const selected = value?.selected_id === opt.id;
          return (
            <label
              key={opt.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                border: selected
                  ? "2px solid var(--color-blue, #4f87f6)"
                  : "1px solid var(--border, #e1e5ee)",
                borderRadius: 6,
                cursor: disabled ? "not-allowed" : "pointer",
                background: selected ? "var(--color-blue-bg, #dbeafe)" : "white",
              }}
            >
              <input
                type="radio"
                name="mcq-single"
                value={opt.id}
                checked={selected}
                onChange={() => onChange({ selected_id: opt.id })}
                disabled={disabled}
              />
              <span style={{ fontWeight: 600, opacity: 0.7 }}>{opt.id}.</span>
              <span style={{ flex: 1 }}>{opt.text}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export interface MCQMultiPayload {
  stem: string;
  options: MCQOption[];
  partial_credit?: boolean;
  explanation?: string;
}

export interface MCQMultiResponse {
  selected_ids: string[];
}

export const MCQMultiRenderer: Renderer<MCQMultiPayload, MCQMultiResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  const selected = new Set(value?.selected_ids ?? []);
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ selected_ids: Array.from(next) });
  }
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
          fontStyle: "italic",
        }}
      >
        Select all correct options. {payload.partial_credit ? "Partial credit applies." : "All correct, none incorrect."}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {payload.options.map((opt) => {
          const isSelected = selected.has(opt.id);
          return (
            <label
              key={opt.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                border: isSelected
                  ? "2px solid var(--color-blue, #4f87f6)"
                  : "1px solid var(--border, #e1e5ee)",
                borderRadius: 6,
                cursor: disabled ? "not-allowed" : "pointer",
                background: isSelected ? "var(--color-blue-bg, #dbeafe)" : "white",
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(opt.id)}
                disabled={disabled}
              />
              <span style={{ fontWeight: 600, opacity: 0.7 }}>{opt.id}.</span>
              <span style={{ flex: 1 }}>{opt.text}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export interface TrueFalsePayload {
  stem: string;
  explanation?: string;
}

export interface TrueFalseResponse {
  selected: boolean;
}

export const TrueFalseRenderer: Renderer<TrueFalsePayload, TrueFalseResponse> = ({
  payload,
  value,
  onChange,
  disabled,
}): ReactNode => {
  return (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 16 }}>
        {payload.stem}
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        {[true, false].map((b) => {
          const selected = value?.selected === b;
          return (
            <button
              key={String(b)}
              type="button"
              onClick={() => onChange({ selected: b })}
              disabled={disabled}
              style={{
                flex: 1,
                padding: 16,
                fontSize: 16,
                fontWeight: 600,
                background: selected
                  ? b
                    ? "var(--color-green, #10c47a)"
                    : "var(--color-red, #f43f5e)"
                  : "white",
                color: selected ? "white" : "inherit",
                border: selected
                  ? "2px solid transparent"
                  : "1px solid var(--border, #e1e5ee)",
                borderRadius: 6,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {b ? "True" : "False"}
            </button>
          );
        })}
      </div>
    </div>
  );
};
