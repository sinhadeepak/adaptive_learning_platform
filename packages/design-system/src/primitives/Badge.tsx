import type { HTMLAttributes, CSSProperties, ReactNode } from "react";
import { colors } from "../tokens/colors";
import { radius } from "../tokens/shape";
import { typography } from "../tokens/typography";
import { spacing } from "../tokens/spacing";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

function toneStyle(tone: BadgeTone): CSSProperties {
  switch (tone) {
    case "success":
      return { color: colors.semantic.success.fg, background: colors.semantic.success.bg };
    case "warning":
      return { color: colors.semantic.warning.fg, background: colors.semantic.warning.bg };
    case "danger":
      return { color: colors.semantic.danger.fg, background: colors.semantic.danger.bg };
    case "info":
      return { color: colors.semantic.info.fg, background: colors.semantic.info.bg };
    case "neutral":
      return { color: colors.text.secondary, background: colors.surface.tertiary };
  }
}

export function Badge({ tone = "neutral", children, style, ...rest }: BadgeProps) {
  const merged: CSSProperties = {
    ...toneStyle(tone),
    display: "inline-flex",
    alignItems: "center",
    padding: `${spacing[1]}px ${spacing[2]}px`,
    fontSize: typography.scale.badge.size,
    fontWeight: typography.scale.badge.weight,
    fontFamily: typography.family.ui,
    borderRadius: radius.pill,
    lineHeight: 1.2,
    ...style,
  };
  return (
    <span style={merged} {...rest}>
      {children}
    </span>
  );
}
