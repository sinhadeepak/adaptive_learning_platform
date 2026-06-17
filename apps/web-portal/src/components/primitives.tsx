import type { CSSProperties, ReactNode } from "react";

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

/* ──────────────────────────────────────────────────────────────
   Dashboard primitives — mirror the web-admin set so the teacher
   portal shares one elevated system. Styling lives in
   src/styles/shell.css (ported from web-admin).
   ────────────────────────────────────────────────────────────── */

export type StatusTone = "success" | "warning" | "danger" | "muted";

/** A small status dot. */
export function StatusDot({ tone = "muted" }: { tone?: StatusTone }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden />;
}

/** KPI tile: mono overline label + large serif-display value. */
export function StatCard({
  label,
  value,
  tone = "muted",
  mono = false,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: StatusTone;
  /** Render the value in mono (for non-numeric values like timestamps). */
  mono?: boolean;
  /** Optional sub-line under the value (benchmark, definition, etc.). */
  hint?: ReactNode;
}) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__label">
        {tone !== "muted" && <StatusDot tone={tone} />}
        {label}
      </div>
      <div className={`stat-card__value${mono ? " stat-card__value--mono" : ""}`}>
        {value}
      </div>
      {hint && <div className="stat-card__hint">{hint}</div>}
    </div>
  );
}

/** Section divider: mono overline + hairline rule + optional count. */
export function SectionHeader({
  label,
  count,
}: {
  label: ReactNode;
  count?: ReactNode;
}) {
  return (
    <div className="section-head">
      <span className="section-head__label">{label}</span>
      <span className="section-head__rule" />
      {count != null && <span className="section-head__count">{count}</span>}
    </div>
  );
}
