// Button — Vidya v1 primitive
//
// Spec: docs/02-design/design-system/04_components.md §1
//
// Variants (canonical 3 + 3 legacy aliases kept for API stability):
//   primary   — --accent fill, white text (default)
//   secondary — --card fill, --ink text, --rule-2 border
//   ghost     — transparent until hover
//   tertiary  — outline, --accent text (legacy alias; renders as outlined accent)
//   aurora    — was the cyan→violet AI gradient; now solid --gold to keep
//               the API working (Vidya signals AI via <AiTag>, not on CTAs)
//   danger    — destructive action; renders --bad
//
// Sizes:  sm 32 / md 40 / lg 48 / xl 56 px min-height. Touch-target
//         floor honored via min-height: max(N, var(--touch-target)).
// State:  idle / loading / disabled
// Density: padding + font-size scale via --space-scale / --type-scale
//          (Vidya's vidya/density-scalars.css compat layer keeps these
//          alive under [data-density="compact|regular|comfy"]).

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "ghost"
  | "aurora"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      fullWidth,
      loading,
      iconLeft,
      iconRight,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "alp-btn",
          `alp-btn--${variant}`,
          `alp-btn--${size}`,
          fullWidth && "alp-btn--full-width",
          loading && "alp-btn--loading",
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...rest}
      >
        {iconLeft ? <span className="alp-btn__icon">{iconLeft}</span> : null}
        <span className="alp-btn__label">{children}</span>
        {iconRight ? <span className="alp-btn__icon">{iconRight}</span> : null}
        {loading ? <span aria-hidden="true" className="alp-btn__spinner" /> : null}
      </button>
    );
  },
);
