export const radius = {
  input: 6,
  button: 6,
  card: 8,
  panel: 8,
  modal: 12,
  pill: 9999,
  avatar: "50%",
  checkbox: 3,
  codeChip: 4,
} as const;

export type RadiusTokens = typeof radius;
