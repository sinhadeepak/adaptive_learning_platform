// StatCard — Aurora compound molecule.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.2
//
// Displays a hero number + label + optional delta + sparkline / icon.
// Used on Home (status strip), Analysis (KPI strip), Topic detail,
// Profile, Billing.
//
//   <StatCard label="Streak" value="47" deltaLabel="+5 wk" tone="reward" />
//   <StatCard label="Readiness" value="10%" deltaLabel="↑ +3%" tone="success" />

import React, { forwardRef } from "react";
import { Card } from "../Card";
import { cn } from "../utils/cn";

export type StatCardTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "reward"
  | "aurora";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Optional icon / glyph rendered left of the value. */
  icon?: React.ReactNode;
  /** Trend / delta sub-line (e.g. "+12 / wk"). */
  deltaLabel?: React.ReactNode;
  /** Tone for the value + delta. */
  tone?: StatCardTone;
  /** Optional sparkline element (caller supplies SVG/PNG). */
  sparkline?: React.ReactNode;
  /** Size — `sm` is the compact status-strip variant; `md` is the default. */
  size?: "sm" | "md";
}

function toneColor(tone: StatCardTone): string {
  switch (tone) {
    case "brand":   return "var(--accent)";
    case "success": return "var(--success-600)";
    case "warning": return "var(--developing-600)";
    case "danger":  return "var(--bad)";
    case "reward":  return "var(--reward-500)";
    case "aurora":  return "var(--gold)";
    default:        return "var(--ink)";
  }
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(function StatCard(
  { label, value, icon, deltaLabel, tone = "neutral", sparkline, size = "md", className, ...rest },
  ref,
) {
  const valueColor = toneColor(tone);
  return (
    <Card
      ref={ref}
      padding={size === "sm" ? "sm" : "md"}
      className={cn("alp-statcard", `alp-statcard--${size}`, className)}
      {...rest}
    >
      <div className="alp-statcard__label-row">
        {icon ? <span className="alp-statcard__icon" aria-hidden="true">{icon}</span> : null}
        <span className="alp-statcard__label">{label}</span>
      </div>
      <div className="alp-statcard__value" style={{ color: valueColor }}>
        {value}
      </div>
      {deltaLabel ? (
        <div className="alp-statcard__delta" style={{ color: valueColor }}>
          {deltaLabel}
        </div>
      ) : null}
      {sparkline ? (
        <div className="alp-statcard__sparkline" aria-hidden="true">
          {sparkline}
        </div>
      ) : null}
    </Card>
  );
});