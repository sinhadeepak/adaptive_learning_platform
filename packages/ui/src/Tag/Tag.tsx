// Tag — Aurora primitive (also serves as Badge with tone-only API).
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.1
//
// Tones map to semantic meaning — never decorative:
//   neutral  — placeholder, unobtrusive label
//   brand    — "active", "new", general emphasis
//   success  — strong mastery, success state
//   warning  — developing mastery, attention needed
//   danger   — weak mastery, error, destructive
//   reward   — streak / XP / level-up
//   aurora   — AI-generated / AI-affordance

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export type TagTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "reward"
  | "aurora";

export type TagVariant = "solid" | "soft" | "outline";

export type TagSize = "sm" | "md";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
  variant?: TagVariant;
  size?: TagSize;
  iconLeft?: React.ReactNode;
}

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  {
    tone = "neutral",
    variant = "soft",
    size = "sm",
    iconLeft,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "alp-tag",
        `alp-tag--${tone}`,
        `alp-tag--${variant}`,
        `alp-tag--${size}`,
        className,
      )}
      {...rest}
    >
      {iconLeft ? <span aria-hidden="true">{iconLeft}</span> : null}
      {children}
    </span>
  );
});
