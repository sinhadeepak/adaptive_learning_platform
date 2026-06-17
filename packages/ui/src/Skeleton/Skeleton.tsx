// Skeleton — Aurora primitive.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.1
//
// Used for >300ms loading states instead of blank panels or spinners.
// Three shapes:
//   text       — a single text line of given height
//   rectangle  — a generic block (image/card placeholder)
//   circle     — for avatars and progress rings
//
// Shimmer respects `prefers-reduced-motion: reduce` (animation disabled
// via the global rule in ui.css).

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export type SkeletonShape = "text" | "rectangle" | "circle";

export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  shape?: SkeletonShape;
  /** CSS width — accepts any length (e.g. "100%", "12rem", 200). */
  width?: number | string;
  /** CSS height — accepts any length. */
  height?: number | string;
}

function toCssDim(v: number | string | undefined, fallback: string): string {
  if (v === undefined) return fallback;
  return typeof v === "number" ? `${v}px` : v;
}

export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton(
  { shape = "rectangle", width, height, className, style, ...rest },
  ref,
) {
  const widthDefault = shape === "text" ? "100%" : shape === "circle" ? "40px" : "100%";
  const heightDefault = shape === "text" ? "1em" : shape === "circle" ? "40px" : "1.5rem";
  const dynamicStyle: React.CSSProperties = {
    width: toCssDim(width, widthDefault),
    height: toCssDim(height, heightDefault),
    ...style,
  };
  return (
    <span
      ref={ref}
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn(
        "alp-skeleton",
        shape === "circle" && "alp-skeleton--circle",
        shape === "text" && "alp-skeleton--text",
        className,
      )}
      style={dynamicStyle}
      {...rest}
    />
  );
});
