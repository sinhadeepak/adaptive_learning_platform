// Tag — Vidya v1 primitive (Pill/Badge with tone-only API).
//
// Spec: docs/02-design/design-system/04_components.md §3
//
// Tones map to semantic meaning — never decorative:
//   neutral  → default (--paper-2 bg, --ink-2 text)
//   brand    → accent  (--accent-soft bg, --accent text)
//   success  → good    (--good-soft, --good)
//   warning  → warn    (--warn-soft, --warn)
//   danger   → bad     (--bad-soft, --bad)
//   reward   → ai      (--gold-soft, --gold-2) — XP/streak share the AI hue
//   aurora   → ai      (--gold-soft, --gold-2) — legacy alias
//
// For the canonical Vidya "AI signal" use <AiTag> instead — it's an
// overline with a gold dot, not a filled pill.

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
