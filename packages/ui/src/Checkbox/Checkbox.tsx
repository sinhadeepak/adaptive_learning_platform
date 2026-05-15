// Checkbox — Aurora atom.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.1
//
// A styled native `<input type="checkbox">`. Native semantics preserved
// so forms, screen readers, and Enter-to-submit all just work.
// Visual styling lives in ui.css under `.alp-checkbox`.

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  size?: "sm" | "md";
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ size = "md", className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn("alp-checkbox", `alp-checkbox--${size}`, className)}
        {...rest}
      />
    );
  },
);
