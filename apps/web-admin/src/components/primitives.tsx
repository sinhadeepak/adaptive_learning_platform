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

export function BoolPill({ value }: { value: boolean }) {
  return (
    <span className={`bool-pill ${value ? "bool-pill-on" : "bool-pill-off"}`}>
      {value ? "ON" : "OFF"}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────
   Dashboard primitives — reusable across admin pages (Ops,
   Console, Analytics). Styling lives in src/styles/shell.css.
   ────────────────────────────────────────────────────────────── */

export type StatusTone = "success" | "warning" | "danger" | "muted";

/** A small status dot. `live` adds a slow pulse (e.g. "all systems"). */
export function StatusDot({
  tone = "muted",
  live = false,
}: {
  tone?: StatusTone;
  live?: boolean;
}) {
  return (
    <span
      className={`status-dot status-dot--${tone}${live ? " status-dot--live" : ""}`}
      aria-hidden
    />
  );
}

/** A status badge (pill) with a leading dot — scannable at a glance. */
export function StatusPill({
  tone = "muted",
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  return (
    <span className={`pill pill-${tone}`}>
      <span className="pill-dot" aria-hidden />
      {children}
    </span>
  );
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

/** Aligned key→value metric rows (mono, tabular). */
export function MetricRows({
  metrics,
}: {
  metrics?: Record<string, string | number | boolean | null> | null;
}) {
  if (!metrics) return null;
  const entries = Object.entries(metrics).filter(([, v]) => v != null);
  if (entries.length === 0) return null;
  return (
    <div className="svc-card__metrics">
      {entries.map(([k, v]) => (
        <div key={k} className="svc-metric">
          <span className="svc-metric__key">{k}</span>
          <span className="svc-metric__val">
            {typeof v === "number" ? v.toLocaleString() : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Elevated component card with a status accent bar + badge. */
export function ServiceCard({
  name,
  tone = "muted",
  badge,
  detail,
  children,
}: {
  name: ReactNode;
  tone?: StatusTone;
  badge?: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`svc-card svc-card--${tone}`}>
      <div className="svc-card__head">
        <span className="svc-card__name">{name}</span>
        {badge}
      </div>
      {detail && <div className="svc-card__detail">{detail}</div>}
      {children}
    </div>
  );
}
