// Radius tokens mirror docs/ui/00_design-system.css custom-property values:
//   --radius-sm: 6, --radius-md: 9, --radius-lg: 13, --radius-xl: 16, --radius-full
// Names below are semantic so primitives don't have to know the numeric value.

export const radius = {
  input: 9, // var(--radius-md)
  button: 9,
  card: 13, // var(--radius-lg)
  panel: 13,
  modal: 16, // var(--radius-xl)
  pill: 9999, // var(--radius-full)
  avatar: "50%",
  checkbox: 6, // var(--radius-sm)
  codeChip: 6,
} as const;

export type RadiusTokens = typeof radius;
