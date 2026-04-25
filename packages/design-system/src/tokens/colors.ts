// Placeholder brand palette — Designer locks final values in Sprint 0 Day 5.
// Structure + names are the contract; hex values will change.

export const colors = {
  brand: {
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    secondary: "#0F172A",
    tint: "#EFF6FF",
    focusRing: "#BFDBFE",
  },
  semantic: {
    success: { fg: "#16A34A", bg: "#DCFCE7" },
    warning: { fg: "#D97706", bg: "#FEF3C7" },
    danger: { fg: "#DC2626", bg: "#FEE2E2" },
    info: { fg: "#2563EB", bg: "#DBEAFE" },
  },
  surface: {
    primary: "#FFFFFF",
    secondary: "#F8FAFC",
    tertiary: "#F1F5F9",
  },
  border: {
    default: "#E2E8F0",
    strong: "#CBD5E1",
  },
  text: {
    primary: "#0F172A",
    secondary: "#475569",
    muted: "#94A3B8",
    disabled: "#CBD5E1",
  },
} as const;

export type ColorTokens = typeof colors;
