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
