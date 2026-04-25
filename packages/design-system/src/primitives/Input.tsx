import { forwardRef, useId, type InputHTMLAttributes, type CSSProperties } from "react";
import { colors } from "../tokens/colors";
import { radius } from "../tokens/shape";
import { typography } from "../tokens/typography";
import { spacing } from "../tokens/spacing";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, style, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const invalid = Boolean(error);

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: `${spacing[2]}px ${spacing[3]}px`,
    fontSize: typography.scale.body.size,
    fontFamily: typography.family.ui,
    color: colors.text.primary,
    background: colors.surface.primary,
    border: `1px solid ${invalid ? colors.semantic.danger.fg : colors.border.default}`,
    borderRadius: radius.input,
    outline: "none",
    ...style,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
      {label ? (
        <label htmlFor={inputId} style={{ fontSize: typography.scale.label.size, fontWeight: typography.scale.label.weight, color: colors.text.secondary }}>
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={hint || error ? `${inputId}-desc` : undefined}
        style={inputStyle}
        {...rest}
      />
      {error ? (
        <span id={`${inputId}-desc`} style={{ fontSize: typography.scale.hint.size, color: colors.semantic.danger.fg }}>
          {error}
        </span>
      ) : hint ? (
        <span id={`${inputId}-desc`} style={{ fontSize: typography.scale.hint.size, color: colors.text.muted }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
