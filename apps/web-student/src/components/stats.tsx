// Phase 7 (P7-A1) — student-facing stats widgets.
// Subset of the web-admin set; only what the student UI needs.

import type { ReactNode } from "react";

export interface ImportanceMeta {
  weight: number;
  source: "override" | "pyq" | "blueprint" | "uniform";
  confidence: number;
  hidden?: boolean;
}

// ─── ImportancePill ──────────────────────────────────────────────────

export function ImportancePill({
  weight,
  source,
  confidence,
  hidden,
}: ImportanceMeta) {
  const sourceLabel: Record<string, string> = {
    override: "Admin set",
    pyq: "Past papers",
    blueprint: "Section share",
    uniform: "Default",
  };
  const sourceTint: Record<string, string> = {
    override: "var(--color-purple, #A78BFA)",
    pyq: "var(--color-blue, #4F87F6)",
    blueprint: "var(--text-muted)",
    uniform: "var(--text-faint)",
  };
  const stars = weight > 0.20 ? 3 : weight > 0.10 ? 2 : weight > 0.04 ? 1 : 0;
  const confLabel =
    confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low";
  return (
    <span
      title={`${sourceLabel[source]} · ${(weight * 100).toFixed(1)}% weight · confidence ${confLabel}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        background: hidden ? "var(--bg-surface3)" : "var(--bg-surface2)",
        border: `1px solid ${sourceTint[source]}`,
        borderRadius: 12,
        fontSize: 11,
        color: hidden ? "var(--text-faint)" : "var(--text-secondary)",
        textDecoration: hidden ? "line-through" : "none",
      }}
    >
      <span style={{ color: sourceTint[source], fontWeight: 700 }}>
        {"★".repeat(stars)}
        {"☆".repeat(3 - stars)}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {(weight * 100).toFixed(0)}%
      </span>
    </span>
  );
}

// ─── MasteryBar ──────────────────────────────────────────────────────

export function MasteryBar({ ewa, n = 0 }: { ewa: number; n?: number }) {
  const pct = Math.max(0, Math.min(1, ewa));
  const tone =
    pct === 0
      ? "var(--text-faint)"
      : pct < 0.4
      ? "var(--color-red, #f43f5e)"
      : pct < 0.7
      ? "var(--color-blue, #4F87F6)"
      : "var(--color-green, #10C47A)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--bg-surface3)",
          borderRadius: 3,
          overflow: "hidden",
          minWidth: 60,
        }}
      >
        <div
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            background: tone,
            transition: "width 200ms",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
          minWidth: 60,
          textAlign: "right",
        }}
      >
        {(pct * 100).toFixed(0)}%{n > 0 && ` · n=${n}`}
      </span>
    </div>
  );
}

// ─── StatTile ────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneColor: Record<string, string> = {
    neutral: "var(--text-primary)",
    good: "var(--color-green, #10C47A)",
    warn: "var(--color-amber, #fbbf24)",
    bad: "var(--color-red, #f43f5e)",
  };
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--bg-surface1)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        minWidth: 120,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.04,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: toneColor[tone],
          fontVariantNumeric: "tabular-nums",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}
