// MasteryBar — single horizontal mastery indicator.
//
// Spec: docs/02-design/design-system/04_components.md §6
//
// Renders a pill-shaped 8px (or 5px mobile-compact) bar whose fill
// color is picked from the canonical Vidya 5-bucket mastery scale:
//
//   ewa ≥ 0.90 → --m-mastered (#1F6B4A · deep emerald)
//   ewa ≥ 0.70 → --m-strong   (#3B8A5E · lifted emerald)
//   ewa ≥ 0.40 → --m-dev      (#A88143 · gold)
//   ewa  > 0   → --m-weak     (#A83A3A · red)
//   ewa = 0    → --m-none     (#E4E4E8 · grey)
//
// Consumers pass a numeric EWA in [0, 1] (not a percent).
// Aria pattern: role="progressbar" + aria-valuenow/min/max.

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export type MasteryBarSize = "sm" | "md";

export interface MasteryBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Exponentially-weighted average mastery in [0, 1]. */
  ewa: number;
  /** 8px (md) default; 5px (sm) for mobile compact rows. */
  size?: MasteryBarSize;
  /**
   * Optional aria-label override. Defaults to "Mastery 56%" for
   * screen reader consumers — bucket label appears in the visible
   * text adjacent to the bar.
   */
  ariaLabel?: string;
}

function bucketColor(ewa: number): string {
  if (ewa >= 0.9) return "var(--m-mastered)";
  if (ewa >= 0.7) return "var(--m-strong)";
  if (ewa >= 0.4) return "var(--m-dev)";
  if (ewa > 0) return "var(--m-weak)";
  return "var(--m-none)";
}

export const MasteryBar = forwardRef<HTMLDivElement, MasteryBarProps>(
  function MasteryBar({ ewa, size = "md", className, style, ariaLabel, ...rest }, ref) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ewa) ? ewa : 0));
    const pct = Math.round(clamped * 100);
    const fill = bucketColor(clamped);
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? `Mastery ${pct}%`}
        className={cn("mastery-bar", `mastery-bar--${size}`, className)}
        style={style}
        {...rest}
      >
        <div
          className="mastery-bar__fill"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
    );
  },
);
