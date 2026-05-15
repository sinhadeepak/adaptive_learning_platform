// Card — Aurora compound primitive (atom-level container).
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.2
//
// Surface tiers map to neutral ramp (50/100/200). Tones overlay an
// Aurora gradient on top of the base surface — reserved for AI,
// celebration, or progress contexts only.

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export type CardSurface = 1 | 2 | 3;
export type CardPadding = "sm" | "md" | "lg";
export type CardTone = "neutral" | "aurora-ai" | "aurora-celebration" | "aurora-progress";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: CardSurface;
  padding?: CardPadding;
  tone?: CardTone;
  interactive?: boolean;
  /** When true, render as <button> so the whole card is keyboard activatable. */
  asButton?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    surface = 1,
    padding = "md",
    tone = "neutral",
    interactive,
    asButton,
    className,
    children,
    ...rest
  },
  ref,
) {
  const classes = cn(
    "alp-card",
    surface === 2 && "alp-card--surface-2",
    surface === 3 && "alp-card--surface-3",
    padding === "sm" && "alp-card--padding-sm",
    padding === "lg" && "alp-card--padding-lg",
    interactive && "alp-card--interactive",
    tone !== "neutral" && `alp-card--tone-${tone}`,
    className,
  );

  if (asButton) {
    const { onClick, ...buttonSafe } = rest as React.HTMLAttributes<HTMLDivElement>;
    return (
      <button
        type="button"
        className={classes}
        ref={ref as unknown as React.Ref<HTMLButtonElement>}
        onClick={onClick as unknown as React.MouseEventHandler<HTMLButtonElement>}
        {...(buttonSafe as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    );
  }

  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  );
});
