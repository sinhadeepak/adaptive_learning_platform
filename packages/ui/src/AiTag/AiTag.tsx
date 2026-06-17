// AiTag — the gold ◈ that marks any AI-touched surface in Vidya.
//
// Spec: docs/02-design/design-system/04_components.md §12
//
// "The only place gold is used as a primary color." Wherever an AI
// authored a draft, recommended a next-best-action, computed readiness,
// or calibrated a score — surface the AiTag so users see the provenance.
//
// Anatomy:
//   • 10.5px mono uppercase · letter-spacing 0.1em
//   • Color  --gold-2
//   • ::before pseudo: 6px circle, --gold bg
//   • No padding/border — it's a label not a chip
//
// Example:
//   <AiTag>AI insight</AiTag>
//   <AiTag>Generated draft</AiTag>

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export interface AiTagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * Override the dot color when the AI provenance is a sub-class
   * (e.g. "calibration confidence" might be --warn). Default --gold.
   */
  dotColor?: string;
}

export const AiTag = forwardRef<HTMLSpanElement, AiTagProps>(function AiTag(
  { className, children, dotColor, style, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn("ai-tag", className)}
      style={dotColor ? { ...style, "--ai-tag-dot": dotColor } as React.CSSProperties : style}
      {...rest}
    >
      {children}
    </span>
  );
});
