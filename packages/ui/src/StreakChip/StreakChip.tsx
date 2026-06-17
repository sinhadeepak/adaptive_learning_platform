// StreakChip — Aurora organism.
//
// Spec: docs/02-design/design-system-v2-aurora.md §9.1
//
// The single most important retention indicator. Lives in the TopBar
// across every authenticated screen. Tapping opens a streak-history
// popover (consumer wires that up — this primitive is presentational).

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export interface StreakChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Current streak count. */
  count: number;
  /** Render the milestone-celebration variant (gold ring) at 7 / 30 / 100 / 365. */
  celebrating?: boolean;
}

export const StreakChip = forwardRef<HTMLButtonElement, StreakChipProps>(
  function StreakChip({ count, celebrating, className, type = "button", ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "alp-streakchip",
          celebrating && "alp-streakchip--celebrating",
          className,
        )}
        aria-label={`Streak: ${count} day${count === 1 ? "" : "s"}`}
        {...rest}
      >
        <span aria-hidden="true" className="alp-streakchip__flame">🔥</span>
        <span className="alp-streakchip__count">{count}</span>
      </button>
    );
  },
);
