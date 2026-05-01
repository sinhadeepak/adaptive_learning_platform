import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Per-question confidence slider (S39 / ADR-0017 dim 6).
//
// Optional; surfaced when calibration is the goal (diagnostic flow,
// mock test). Backend captures the value on quiz submit (NATS payload
// extends with `confidence`); engagement.process_session writes to
// confidence_calibration → Brier score on read.
// ─────────────────────────────────────────────────────────────────────────

interface ConfidenceSliderProps {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}

const PRESETS: Array<{ label: string; value: number }> = [
  { label: "Guessing", value: 0.25 },
  { label: "Maybe", value: 0.5 },
  { label: "Pretty sure", value: 0.75 },
  { label: "Certain", value: 0.95 },
];

export function ConfidenceSlider({
  value,
  onChange,
  disabled,
}: ConfidenceSliderProps): ReactNode {
  return (
    <div
      style={{
        padding: 12,
        background: "var(--bg-subtle, #f8f9fc)",
        borderRadius: 8,
        marginTop: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 500 }}>
          How sure are you?{" "}
          <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span>
        </label>
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              background: "transparent",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 12,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.value)}
            disabled={disabled}
            style={{
              flex: 1,
              padding: "6px 4px",
              background:
                value === p.value
                  ? "var(--color-blue, #4f87f6)"
                  : "white",
              color: value === p.value ? "white" : "inherit",
              border: "1px solid var(--border, #e1e5ee)",
              borderRadius: 4,
              cursor: disabled ? "not-allowed" : "pointer",
              fontSize: 12,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value !== null ? value * 100 : 50}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        disabled={disabled}
        style={{ width: "100%" }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          opacity: 0.7,
          marginTop: 2,
        }}
      >
        <span>0%</span>
        <span style={{ fontWeight: 600 }}>
          {value !== null ? `${(value * 100).toFixed(0)}% confident` : "—"}
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}
