// ProgressRing — Aurora primitive.
//
// Circular progress with an inset label slot. Used by MasteryCell,
// MissionCard, exam-progress widgets. SVG-driven so it scales clean
// at any size.
//
// `tone` accepts our mastery tokens (weak/dev/strong/mastered) or a
// custom CSS color value. The mastered state uses the Aurora-progress
// gradient (via a foreignObject? No — SVG strokes can't gradient via
// CSS vars directly, so we paint mastered as a flat success-aurora
// blend color and let the surrounding card carry the gradient halo).

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export type ProgressRingTone =
  | "neutral"
  | "weak"
  | "developing"
  | "strong"
  | "mastered"
  | "aurora";

export interface ProgressRingProps extends Omit<React.SVGAttributes<SVGSVGElement>, "children"> {
  /** 0..1 */
  value: number;
  /** outer diameter in px */
  size?: number;
  /** stroke width in px */
  thickness?: number;
  tone?: ProgressRingTone;
  /** Optional label rendered centered inside the ring. */
  children?: React.ReactNode;
  /** Override the track color (defaults to neutral-200). */
  trackColor?: string;
}

function strokeFor(tone: ProgressRingTone): string {
  switch (tone) {
    case "weak":       return "var(--danger-600)";
    case "developing": return "var(--developing-600)";
    case "strong":     return "var(--success-600)";
    case "mastered":   return "var(--success-500)";
    case "aurora":     return "var(--brand-600)";
    default:           return "var(--neutral-500)";
  }
}

export const ProgressRing = forwardRef<SVGSVGElement, ProgressRingProps>(
  function ProgressRing(
    {
      value,
      size = 56,
      thickness = 6,
      tone = "neutral",
      trackColor,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const clamped = Math.max(0, Math.min(1, value));
    const r = (size - thickness) / 2;
    const cx = size / 2;
    const c = 2 * Math.PI * r;
    const dashOffset = c * (1 - clamped);
    const labelSize = Math.max(10, Math.floor(size * 0.28));
    return (
      <span
        className={cn("alp-progressring", className)}
        style={{ width: size, height: size }}
      >
        <svg
          ref={ref}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="progressbar"
          aria-valuenow={Math.round(clamped * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          {...rest}
        >
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={trackColor ?? "var(--neutral-200)"}
            strokeWidth={thickness}
          />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={strokeFor(tone)}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cx})`}
            style={{
              transition: "stroke-dashoffset var(--m-base, 180ms) var(--m-ease, ease-out)",
            }}
          />
        </svg>
        {children ? (
          <span
            className="alp-progressring__label"
            style={{ fontSize: labelSize }}
            aria-hidden="true"
          >
            {children}
          </span>
        ) : null}
      </span>
    );
  },
);
