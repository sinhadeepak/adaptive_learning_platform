import type { ReactNode } from "react";
import type { Renderer } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Numeric family renderers (P5-S59).
//
// Covers: NUMERIC_INTEGER · NUMERIC_DECIMAL · NUMERIC_RANGE · FORMULA_INPUT
// ─────────────────────────────────────────────────────────────────────────

interface NumericPayload {
  stem: string;
  unit?: string | null;
  explanation?: string;
}

export interface NumericIntegerPayload extends NumericPayload {
  correct?: number; // hidden from student
}

export interface NumericIntegerResponse {
  answer: number;
}

export const NumericIntegerRenderer: Renderer<NumericIntegerPayload, NumericIntegerResponse> = ({
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          step={1}
          value={value?.answer ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onChange(null);
            else {
              const parsed = parseInt(v, 10);
              if (!Number.isNaN(parsed)) onChange({ answer: parsed });
            }
          }}
          disabled={disabled}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border, #e1e5ee)",
            borderRadius: 4,
            fontSize: 18,
            width: 200,
            fontFamily: "monospace",
          }}
        />
        {payload.unit && (
          <span style={{ fontSize: 16, opacity: 0.7 }}>{payload.unit}</span>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
        Enter an integer value
      </div>
    </div>
  );
};

export interface NumericDecimalPayload extends NumericPayload {
  correct?: number;
  tolerance?: number;
}

export interface NumericDecimalResponse {
  answer: number;
}

export const NumericDecimalRenderer: Renderer<NumericDecimalPayload, NumericDecimalResponse> = ({
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          step="any"
          value={value?.answer ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onChange(null);
            else {
              const parsed = parseFloat(v);
              if (!Number.isNaN(parsed)) onChange({ answer: parsed });
            }
          }}
          disabled={disabled}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border, #e1e5ee)",
            borderRadius: 4,
            fontSize: 18,
            width: 200,
            fontFamily: "monospace",
          }}
        />
        {payload.unit && (
          <span style={{ fontSize: 16, opacity: 0.7 }}>{payload.unit}</span>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
        Enter a decimal value
        {payload.tolerance ? ` (tolerance ±${payload.tolerance})` : ""}
      </div>
    </div>
  );
};

export interface NumericRangePayload extends NumericPayload {
  low?: number;
  high?: number;
}

export const NumericRangeRenderer: Renderer<NumericRangePayload, NumericDecimalResponse> = NumericDecimalRenderer;

export interface FormulaInputPayload {
  stem: string;
  target_expression?: string;
  explanation?: string;
}

export interface FormulaInputResponse {
  expression: string;
}

export const FormulaInputRenderer: Renderer<FormulaInputPayload, FormulaInputResponse> = ({
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
      <input
        type="text"
        value={value?.expression ?? ""}
        onChange={(e) =>
          e.target.value === ""
            ? onChange(null)
            : onChange({ expression: e.target.value })
        }
        disabled={disabled}
        placeholder="e.g.  x^2 + 2*x + 1"
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1px solid var(--border, #e1e5ee)",
          borderRadius: 4,
          fontSize: 18,
          fontFamily: "monospace",
        }}
      />
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
        Use standard math notation. Equivalent forms (e.g. (x+1)^2) accepted.
      </div>
    </div>
  );
};
