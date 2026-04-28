// 4px base grid. Values in pixels.

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
} as const;

export type SpacingTokens = typeof spacing;
export type SpacingKey = keyof SpacingTokens;
