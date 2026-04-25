import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { colors } from "../tokens/colors";
import { radius } from "../tokens/shape";
import { elevation } from "../tokens/elevation";
import { typography } from "../tokens/typography";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const sizeMap: Record<ButtonSize, { padY: number; padX: number; fontSize: number }> = {
  sm: { padY: 6, padX: 10, fontSize: typography.scale.button.sm },
  md: { padY: 8, padX: 14, fontSize: typography.scale.button.md },
  lg: { padY: 10, padX: 18, fontSize: typography.scale.button.lg },
};

function variantStyle(variant: ButtonVariant): CSSProperties {
  switch (variant) {
    case "primary":
      return { background: colors.brand.primary, color: colors.surface.primary, border: "1px solid transparent" };
    case "secondary":
      return { background: colors.surface.primary, color: colors.text.primary, border: `1px solid ${colors.border.default}` };
    case "ghost":
      return { background: "transparent", color: colors.text.primary, border: "1px solid transparent" };
    case "danger":
      return { background: colors.semantic.danger.fg, color: colors.surface.primary, border: "1px solid transparent" };
    case "link":
      return { background: "transparent", color: colors.brand.primary, border: "1px solid transparent", textDecoration: "underline" };
  }
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", isLoading, disabled, children, style, ...rest },
  ref
) {
  const s = sizeMap[size];
  const merged: CSSProperties = {
    ...variantStyle(variant),
    padding: `${s.padY}px ${s.padX}px`,
    fontSize: s.fontSize,
    fontWeight: typography.scale.button.weight,
    fontFamily: typography.family.ui,
    borderRadius: radius.button,
    cursor: disabled || isLoading ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    boxShadow: elevation.flat,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    ...style,
  };
  return (
    <button ref={ref} disabled={disabled || isLoading} style={merged} {...rest}>
      {isLoading ? "…" : children}
    </button>
  );
});
