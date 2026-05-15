// FormField — Aurora molecule.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.2
//
// Wraps a single labelled control (Input, Textarea, Select). Owns:
//   * Label association (`htmlFor` derived from auto-id or user-supplied `id`)
//   * Optional `required` marker (visual + aria)
//   * Helper text (`aria-describedby`-linked)
//   * Error message (`aria-describedby` + role="alert")
//
// Children receive the wired-up id + aria props via a context. If the
// child is a single <Input>, you can also pass props through `inputProps`
// (escape hatch when you don't want context wiring).

import React, { useId, forwardRef } from "react";
import { cn } from "../utils/cn";

export interface FormFieldProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  function FormField(
    { label, htmlFor, required, helper, error, children, className, ...rest },
    ref,
  ) {
    const autoId = useId();
    const id = htmlFor ?? `ff-${autoId}`;
    const helperId = helper ? `${id}-helper` : undefined;
    const errorId = error ? `${id}-error` : undefined;

    // Clone children to inject id + aria-describedby + aria-invalid
    const wiredChildren = React.Children.map(children, (child) => {
      if (!React.isValidElement(child)) return child;
      const describedBy =
        [helperId, errorId].filter(Boolean).join(" ") || undefined;
      const childProps = child.props as Record<string, unknown>;
      return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
        id: (childProps.id as string | undefined) ?? id,
        "aria-describedby":
          (childProps["aria-describedby"] as string | undefined) ?? describedBy,
        "aria-invalid":
          (childProps["aria-invalid"] as boolean | undefined) ?? Boolean(error),
      });
    });

    return (
      <div ref={ref} className={cn("alp-formfield", className)} {...rest}>
        <label htmlFor={id} className="alp-formfield__label">
          {label}
          {required ? (
            <span aria-hidden="true" className="alp-formfield__req">*</span>
          ) : null}
        </label>
        {wiredChildren}
        {helper && !error ? (
          <p id={helperId} className="alp-formfield__helper">
            {helper}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="alp-formfield__error">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
