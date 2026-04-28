/* React translations of the canonical ALP_* helpers from
   docs/ui/01_StudentPortal_Web/00_components.js. Each component is a thin
   wrapper that emits the same DOM shape the canonical .html screens use,
   so the shared shell.css styling cascades correctly. */

import type { CSSProperties, ReactNode } from "react";

// ── Strength bucket: EWA in [0, 1] → token bucket name ──────────────────
export type Strength = "STRONG" | "DEVELOPING" | "WEAK" | "NOT_STARTED";

export function strengthFor(ewa: number): Strength {
  if (ewa >= 0.7) return "STRONG";
  if (ewa >= 0.4) return "DEVELOPING";
  if (ewa > 0) return "WEAK";
  return "NOT_STARTED";
}

const strengthClass: Record<Strength, string> = {
  STRONG: "str-strong",
  DEVELOPING: "str-developing",
  WEAK: "str-weak",
  NOT_STARTED: "str-not-started",
};

const strengthLabel: Record<Strength, string> = {
  STRONG: "Strong",
  DEVELOPING: "Developing",
  WEAK: "Weak",
  NOT_STARTED: "Not started",
};

const strengthBarColor: Record<Strength, string> = {
  STRONG: "var(--color-green)",
  DEVELOPING: "var(--color-blue)",
  WEAK: "var(--color-red)",
  NOT_STARTED: "var(--text-faint)",
};

// ── KPI tile (small dashboard stat) ─────────────────────────────────────
export function KpiTile({
  value,
  label,
  delta,
  deltaTone = "neutral",
}: {
  value: ReactNode;
  label: string;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
}): ReactNode {
  return (
    <div className="kpi-tile">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      {delta ? (
        <span className={`kpi-delta ${deltaTone === "positive" ? "" : deltaTone}`}>{delta}</span>
      ) : null}
    </div>
  );
}

// ── Subject row (mastery progress) ──────────────────────────────────────
export function SubjectRow({
  name,
  pct,
  meta,
  href,
}: {
  name: string;
  pct: number; // 0..100
  meta?: string;
  href?: string;
}): ReactNode {
  const strength = strengthFor(pct / 100);
  const color = strengthBarColor[strength];
  const Component: "a" | "div" = href ? "a" : "div";
  return (
    <Component className="subject-row" {...(href ? { href } : {})}>
      <div className="subject-row-header">
        <span className="subject-name">{name}</span>
        <span className="subject-pct" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="subject-meta">
        <span className={`str ${strengthClass[strength]}`}>{strengthLabel[strength]}</span>
        {meta ? <> · {meta}</> : null}
      </span>
    </Component>
  );
}

// ── AI insight panel ────────────────────────────────────────────────────
export interface InsightItem {
  text: string;
  tone?: "ai" | "warning" | "success" | "muted";
}

const insightDotColor: Record<NonNullable<InsightItem["tone"]>, string> = {
  ai: "var(--color-ai)",
  warning: "var(--color-amber)",
  success: "var(--color-green)",
  muted: "var(--text-faint)",
};

export function AiInsightPanel({ items }: { items: InsightItem[] }): ReactNode {
  if (items.length === 0) return null;
  return (
    <div className="ai-insight-panel">
      <div className="ai-insight-title">◈ AI INSIGHTS</div>
      {items.map((item, i) => (
        <div key={i} className="ai-insight-row">
          <span
            className="ai-insight-dot"
            style={{ background: insightDotColor[item.tone ?? "ai"] }}
            aria-hidden
          />
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── Pill (tier / status chip) ───────────────────────────────────────────
export type PillTone = "info" | "warning" | "success" | "danger" | "muted";

export function Pill({
  tone = "muted",
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}): ReactNode {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

// ── Banner (info / warning / danger / success) ──────────────────────────
export function Banner({
  tone = "info",
  icon,
  children,
  role,
}: {
  tone?: PillTone;
  icon?: ReactNode;
  children: ReactNode;
  role?: "alert" | "status";
}): ReactNode {
  const fallbackIcon: Record<PillTone, string> = {
    info: "ℹ︎",
    warning: "⚠︎",
    danger: "⚠︎",
    success: "✓",
    muted: "•",
  };
  return (
    <div className={`banner banner-${tone}`} role={role}>
      <span className="banner-icon" aria-hidden>
        {icon ?? fallbackIcon[tone]}
      </span>
      <span className="banner-body">{children}</span>
    </div>
  );
}

// ── Skeleton row (loading state) ────────────────────────────────────────
export function SkeletonRows({
  count = 3,
  style,
}: {
  count?: number;
  style?: CSSProperties;
}): ReactNode {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}

// ── Readiness ring (SVG, gradient stroke) ───────────────────────────────
export function ReadinessRing({
  score,
  size = 90,
}: {
  score: number; // 0..100
  size?: number;
}): ReactNode {
  const r = (size - size * 0.18) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const c = size / 2;
  const id = `ring-grad-${size}`;

  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      aria-label={`Readiness ${score}%`}
      role="img"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-green)" />
            <stop offset="100%" stopColor="var(--color-blue)" />
          </linearGradient>
        </defs>
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={size * 0.09}
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={size * 0.09}
          strokeLinecap="round"
          strokeDasharray={circ.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: size * 0.28,
            fontWeight: 800,
            background: "linear-gradient(135deg, var(--color-green), var(--color-blue))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {score}
        </div>
        <div
          style={{
            fontSize: size * 0.09,
            color: "var(--text-faint)",
            marginTop: 1,
            letterSpacing: 0.3,
          }}
        >
          READINESS
        </div>
      </div>
    </div>
  );
}
