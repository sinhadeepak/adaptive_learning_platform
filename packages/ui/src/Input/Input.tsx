// Input — Aurora primitive.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.1
//
// Renders a styled <input>. Pair with FormField for the
// label/helper/error wrapping. Prefix/suffix slots accept icons
// or static decorators (units, currency symbols, kbd hints).

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export type InputSize = "sm" | "md" | "lg";
export type InputState = "default" | "error" | "success";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  inputSize?: InputSize;
  state?: InputState;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    inputSize = "md",
    state = "default",
    prefix,
    suffix,
    className,
    ...rest
  },
  ref,
) {
  const hasAffix = Boolean(prefix || suffix);
  if (!hasAffix) {
    return (
      <input
        ref={ref}
        className={cn(
          "alp-input",
          `alp-input--${inputSize}`,
          state !== "default" && `alp-input--${state}`,
          className,
        )}
        aria-invalid={state === "error" || undefined}
        {...rest}
      />
    );
  }
  return (
    <span
      className={cn(
        "alp-input-group",
        `alp-input-group--${inputSize}`,
        state !== "default" && `alp-input-group--${state}`,
        className,
      )}
    >
      {prefix ? (
        <span className="alp-input-group__affix" aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      <input
        ref={ref}
        className="alp-input alp-input--unstyled"
        aria-invalid={state === "error" || undefined}
        {...rest}
      />
      {suffix ? (
        <span className="alp-input-group__affix" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </span>
  );
});
