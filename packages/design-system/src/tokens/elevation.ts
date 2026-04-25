export const elevation = {
  flat: "none",
  hover: "0 2px 8px rgba(0,0,0,0.06)",
  dropdown: "0 4px 16px rgba(0,0,0,0.10)",
  focusRing: "0 0 0 3px #BFDBFE",
} as const;

export type ElevationTokens = typeof elevation;
