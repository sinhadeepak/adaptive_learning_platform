// Phase 7 (P7-A1) — shared stats widgets used across the AnalyticsDrill
// page and (in follow-ups) Institute / Platform analytics surfaces.
//
// Eight components, all dark-theme by default (matching the rest of
// web-admin's tokens). One file because they share styling primitives;
// split out if any one grows substantially.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

// ─── Types ──────────────────────────────────────────────────────────

export interface ImportanceMeta {
  weight: number;
  source: "override" | "pyq" | "blueprint" | "uniform";
  confidence: number; // 0..1
  hidden?: boolean;
}

export interface DrillColumn<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
}

// ─── 1. StatTile ─────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  delta,
  importance,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  delta?: { value: number; label?: string };
  importance?: ImportanceMeta;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneColor: Record<string, string> = {
    neutral: "var(--ink)",
    good: "var(--good, #10C47A)",
    warn: "var(--warn, #fbbf24)",
    bad: "var(--bad, #f43f5e)",
  };
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        minWidth: 140,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.04,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: toneColor[tone],
          fontVariantNumeric: "tabular-nums",
          marginTop: 2,
        }}
      >
        {value}
      </div>
      {delta !== undefined && (
        <div
          style={{
            fontSize: 11,
            color:
              delta.value > 0
                ? "var(--good, #10C47A)"
                : delta.value < 0
                ? "var(--bad, #f43f5e)"
                : "var(--ink-3)",
            marginTop: 2,
          }}
        >
          {delta.value > 0 ? "▲" : delta.value < 0 ? "▼" : "•"}{" "}
          {Math.abs(delta.value).toFixed(1)}
          {delta.label ? ` ${delta.label}` : ""}
        </div>
      )}
      {importance && (
        <div style={{ marginTop: 6 }}>
          <ImportancePill {...importance} />
        </div>
      )}
    </div>
  );
}

// ─── 2. DrillDownTable ──────────────────────────────────────────────

export function DrillDownTable<T>({
  rows,
  columns,
  onRowClick,
  emptyText = "No data",
  loading = false,
}: {
  rows: T[];
  columns: DrillColumn<T>[];
  onRowClick?: (row: T) => void;
  emptyText?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "var(--ink-3)",
        }}
      >
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "var(--ink-3)",
          background: "var(--paper-2)",
          border: "1px dashed var(--rule)",
          borderRadius: 8,
        }}
      >
        {emptyText}
      </div>
    );
  }
  return (
    <div
      style={{
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr
            style={{
              background: "var(--card)",
              color: "var(--ink-3)",
              borderBottom: "1px solid var(--rule)",
              textAlign: "left",
            }}
          >
            {columns.map((c) => (
              <th
                key={String(c.key)}
                style={{
                  padding: "10px 12px",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.04,
                  textAlign: c.align ?? "left",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={((r as { id?: string }).id) ?? i}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={{
                borderBottom: "1px solid var(--rule)",
                color: "var(--ink)",
                cursor: onRowClick ? "pointer" : "default",
              }}
              onMouseEnter={(e) => {
                if (onRowClick)
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--card)";
              }}
              onMouseLeave={(e) => {
                if (onRowClick)
                  (e.currentTarget as HTMLElement).style.background = "";
              }}
            >
              {columns.map((c) => (
                <td
                  key={String(c.key)}
                  style={{
                    padding: "10px 12px",
                    textAlign: c.align ?? "left",
                  }}
                >
                  {c.render
                    ? c.render(r)
                    : ((r as Record<string, ReactNode>)[c.key as string]) ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 3. HierarchyBreadcrumb ─────────────────────────────────────────

export function HierarchyBreadcrumb({
  levels,
}: {
  levels: { label: string; href?: string; icon?: string }[];
}) {
  return (
    <nav
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
        fontSize: 13,
        color: "var(--ink-3)",
        padding: "8px 0",
      }}
      aria-label="breadcrumb"
    >
      {levels.map((lvl, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 && <span style={{ margin: "0 6px", opacity: 0.5 }}>›</span>}
          {lvl.icon && <span style={{ marginRight: 4 }}>{lvl.icon}</span>}
          {lvl.href && i < levels.length - 1 ? (
            <Link
              to={lvl.href}
              style={{
                color: "var(--info)",
                textDecoration: "none",
              }}
            >
              {lvl.label}
            </Link>
          ) : (
            <span
              style={{
                color:
                  i === levels.length - 1
                    ? "var(--ink)"
                    : "var(--ink-3)",
                fontWeight: i === levels.length - 1 ? 600 : 400,
              }}
            >
              {lvl.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ─── 4. ImportancePill ──────────────────────────────────────────────

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
    override: "var(--accent, #A78BFA)",
    pyq: "var(--info, #4F87F6)",
    blueprint: "var(--ink-3)",
    uniform: "var(--ink-4)",
  };
  const stars =
    weight > 0.20 ? 3 : weight > 0.10 ? 2 : weight > 0.04 ? 1 : 0;
  const confLabel =
    confidence >= 0.8
      ? "high"
      : confidence >= 0.5
      ? "medium"
      : "low";
  return (
    <span
      title={`${sourceLabel[source]} · ${(weight * 100).toFixed(1)}% weight · confidence ${confLabel}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        background: hidden
          ? "var(--paper-2)"
          : "var(--card)",
        border: `1px solid ${sourceTint[source]}`,
        borderRadius: 12,
        fontSize: 11,
        color: hidden ? "var(--ink-4)" : "var(--ink-2)",
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
      {hidden && <span>· hidden</span>}
    </span>
  );
}

// ─── 5. MasteryBar ──────────────────────────────────────────────────

export function MasteryBar({ ewa, n = 0 }: { ewa: number; n?: number }) {
  const pct = Math.max(0, Math.min(1, ewa));
  const tone =
    pct === 0
      ? "var(--ink-4)"
      : pct < 0.4
      ? "var(--bad, #f43f5e)"
      : pct < 0.7
      ? "var(--info, #4F87F6)"
      : "var(--good, #10C47A)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--paper-2)",
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
          color: "var(--ink-2)",
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

// ─── 6. BloomMatrix ─────────────────────────────────────────────────

const BLOOM_LEVELS = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE"] as const;

export function BloomMatrix({
  cells,
}: {
  cells: Record<string, { avgEwa: number; n: number }>;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
      {BLOOM_LEVELS.map((lvl) => {
        const cell = cells[lvl];
        const ewa = cell?.avgEwa ?? null;
        const n = cell?.n ?? 0;
        const tone =
          ewa === null
            ? "var(--ink-4)"
            : ewa < 0.4
            ? "var(--bad, #f43f5e)"
            : ewa < 0.7
            ? "var(--info, #4F87F6)"
            : "var(--good, #10C47A)";
        return (
          <div
            key={lvl}
            title={
              ewa === null
                ? `${lvl}: insufficient data (n<3)`
                : `${lvl}: EWA ${ewa.toFixed(2)} (n=${n})`
            }
            style={{
              padding: "4px 6px",
              borderRadius: 4,
              background: "var(--paper-2)",
              border: `1px solid ${tone}`,
              textAlign: "center",
              fontSize: 10,
              color:
                ewa === null ? "var(--ink-4)" : "var(--ink)",
            }}
          >
            <div
              style={{
                textTransform: "uppercase",
                letterSpacing: 0.04,
                fontSize: 9,
                color: "var(--ink-3)",
                marginBottom: 1,
              }}
            >
              {lvl.slice(0, 3)}
            </div>
            <div
              style={{
                fontWeight: 700,
                color: tone,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ewa === null ? "—" : `${(ewa * 100).toFixed(0)}%`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 7. StrongWeakSummary ───────────────────────────────────────────

export function StrongWeakSummary({
  strong,
  developing,
  weak,
  notStarted,
}: {
  strong: number;
  developing: number;
  weak: number;
  notStarted: number;
}) {
  const total = strong + developing + weak + notStarted || 1;
  const seg = (n: number, color: string, label: string) => (
    <div
      key={label}
      title={`${label}: ${n}`}
      style={{
        flex: n / total,
        background: color,
        height: "100%",
        minWidth: n > 0 ? 4 : 0,
      }}
    />
  );
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 8,
          borderRadius: 4,
          overflow: "hidden",
          background: "var(--paper-2)",
          marginBottom: 6,
        }}
      >
        {seg(strong, "var(--good, #10C47A)", "Strong")}
        {seg(developing, "var(--info, #4F87F6)", "Developing")}
        {seg(weak, "var(--bad, #f43f5e)", "Weak")}
        {seg(notStarted, "var(--ink-4)", "Not started")}
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          fontSize: 11,
          color: "var(--ink-3)",
          flexWrap: "wrap",
        }}
      >
        <span>
          <Dot c="var(--good, #10C47A)" /> Strong {strong}
        </span>
        <span>
          <Dot c="var(--info, #4F87F6)" /> Developing {developing}
        </span>
        <span>
          <Dot c="var(--bad, #f43f5e)" /> Weak {weak}
        </span>
        <span>
          <Dot c="var(--ink-4)" /> Not started {notStarted}
        </span>
      </div>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 4,
        background: c,
        marginRight: 4,
        verticalAlign: "middle",
      }}
    />
  );
}

// ─── 8. ColdStartProjection ─────────────────────────────────────────

export function ColdStartProjection({
  projection,
}: {
  projection?: { type: string; subjects?: { name: string; expectedAvgReadiness: number }[]; note?: string } | null;
}) {
  if (!projection) return null;
  return (
    <div
      style={{
        padding: 16,
        background: "var(--paper-2)",
        border: "1px dashed var(--warn, #fbbf24)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            padding: "2px 6px",
            background: "var(--warn, #fbbf24)",
            color: "var(--paper)",
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 3,
            letterSpacing: 0.06,
          }}
        >
          PROJECTED
        </span>
        <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
          {projection.note ?? "No live data yet"}
        </span>
      </div>
      {(projection.subjects ?? []).length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {(projection.subjects ?? []).map((s) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--ink-3)",
                  width: 100,
                }}
              >
                {s.name}
              </span>
              <MasteryBar ewa={s.expectedAvgReadiness} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}