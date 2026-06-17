// MasteryStack — segmented 5-bucket distribution bar.
//
// Spec: docs/02-design/design-system/04_components.md §6
//
// Shows a topic-pool's distribution across the canonical 5 mastery
// buckets in a single 10px bar. Useful for "120 topics: 8 mastered ·
// 14 strong · 33 dev · 27 weak · 38 not started" summaries.
//
// Segment order (left → right): mastered · strong · dev · weak · none.

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export interface MasteryStackCounts {
  mastered: number;
  strong: number;
  dev: number;
  weak: number;
  none: number;
}

export interface MasteryStackProps extends React.HTMLAttributes<HTMLDivElement> {
  counts: MasteryStackCounts;
  /** Default true. When false, segments render with no rounding to
   * sit flush in inline contexts. */
  rounded?: boolean;
  ariaLabel?: string;
}

const SEGMENTS: Array<{ key: keyof MasteryStackCounts; color: string; label: string }> = [
  { key: "mastered", color: "var(--m-mastered)", label: "Mastered" },
  { key: "strong",   color: "var(--m-strong)",   label: "Strong"   },
  { key: "dev",      color: "var(--m-dev)",      label: "Developing" },
  { key: "weak",     color: "var(--m-weak)",     label: "Weak" },
  { key: "none",     color: "var(--m-none)",     label: "Not started" },
];

export const MasteryStack = forwardRef<HTMLDivElement, MasteryStackProps>(
  function MasteryStack({ counts, rounded = true, className, ariaLabel, ...rest }, ref) {
    const total =
      counts.mastered + counts.strong + counts.dev + counts.weak + counts.none;
    return (
      <div
        ref={ref}
        role="img"
        aria-label={
          ariaLabel ??
          `${total} topics: ${counts.mastered} mastered, ${counts.strong} strong, ${counts.dev} developing, ${counts.weak} weak, ${counts.none} not started`
        }
        className={cn("mastery-stack", rounded && "mastery-stack--rounded", className)}
        {...rest}
      >
        {SEGMENTS.map(({ key, color, label }) => {
          const n = counts[key];
          if (n <= 0 || total === 0) return null;
          const pct = (n / total) * 100;
          return (
            <span
              key={key}
              className="mastery-stack__segment"
              style={{ width: `${pct}%`, background: color }}
              title={`${label}: ${n}`}
            />
          );
        })}
      </div>
    );
  },
);
