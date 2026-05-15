// Button — Aurora primitive
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.1
//
// Variants:
//   primary   — brand-600 fill, white text (default)
//   secondary — neutral fill, dark text
//   tertiary  — outline, brand text
//   ghost     — transparent until hover
//   aurora    — gradient AI CTA (cyan→violet); reserved for AI/celebration
//   danger    — destructive action
//
// Sizes:  sm 32 / md 40 / lg 48 / xl 56 px min-height (Aspirant; scales w/ density)
// State:  idle / loading / disabled
// Density: padding & font-size scale by --space-scale and --type-scale.

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
