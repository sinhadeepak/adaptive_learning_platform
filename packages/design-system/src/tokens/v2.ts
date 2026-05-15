// ============================================================
// AURORA v2 TOKENS — TypeScript mirror of tokens.v2.css
//
// Prefer reading the CSS custom property at runtime
// (`var(--brand-600)`, `var(--aurora-ai)`, etc.) so theme + density
// switches flow through without JS rebuild. This module exists so
// that components needing a token VALUE (e.g. computing canvas
// gradients) can reach for it programmatically.
//
// Spec: docs/02-design/design-system-v2-aurora.md
// ============================================================

export const brand = {
  50: "#F4F4FE",
  100: "#EBEBFB",
  500: "#7B7BE0",
  600: "#5B5BD6",
  700: "#4949B8",
} as const;

export const semantic = {
  success: { 50: "#ECFDF5", 500: "#22C55E", 600: "#16A34A" },
  proficient: { 50: "#ECFEFF", 500: "#06B6D4", 600: "#0891B2" },
  developing: { 50: "#FFFBEB", 500: "#F59E0B", 600: "#D97706" },
  danger: { 50: "#FEF2F2", 500: "#EF4444", 600: "#DC2626" },
  reward: { 50: "#FFF7ED", 500: "#F97316", 600: "#EA580C" },
  locked: { 500: "#94A3B8" },
} as const;

export const auroraGradients = {
  ai: "linear-gradient(135deg, #06B6D4 0%, #7C3AED 100%)",
  celebration: "linear-gradient(135deg, #F59E0B 0%, #EC4899 100%)",
  progress: "linear-gradient(135deg, #22C55E 0%, #06B6D4 100%)",
} as const;

export const subjectColors = {
  physics: "#0EA5E9",
  chemistry: "#F97316",
  biology: "#10B981",
  maths: "#8B5CF6",
  english: "#EC4899",
  history: "#A16207",
  geography: "#0D9488",
  gs: "#6366F1",
  cs: "#3B82F6",
  hindi: "#DC2626",
} as const;

export const neutralRamp = {
  0: "#FFFFFF",
  50: "#F8FAFC",
  100: "#F1F5F9",
  200: "#E2E8F0",
  300: "#CBD5E1",
  400: "#94A3B8",
  500: "#64748B",
  600: "#475569",
  700: "#334155",
  800: "#1E293B",
  900: "#0F172A",
} as const;

export const masteryScale = {
  notStarted: { token: "--mastery-0", min: 0, max: 0 },
  weak: { token: "--mastery-weak", min: 0.01, max: 0.39 },
  developing: { token: "--mastery-dev", min: 0.4, max: 0.69 },
  strong: { token: "--mastery-strong", min: 0.7, max: 0.89 },
  mastered: { token: "--mastery-mastered", min: 0.9, max: 1.0 },
} as const;

export type MasteryBucket = keyof typeof masteryScale;

/** Map an EWA value (0-1) to its mastery bucket. */
export function bucketForEwa(ewa: number): MasteryBucket {
  if (ewa <= 0) return "notStarted";
  if (ewa < 0.4) return "weak";
  if (ewa < 0.7) return "developing";
  if (ewa < 0.9) return "strong";
  return "mastered";
}

export const typeScale = {
  display: { size: "2.25rem", line: "2.75rem", weight: 700, track: "-0.02em" },
  h1: { size: "1.75rem", line: "2.25rem", weight: 700, track: "-0.015em" },
  h2: { size: "1.375rem", line: "1.875rem", weight: 600, track: "-0.01em" },
  h3: { size: "1.125rem", line: "1.625rem", weight: 600, track: "-0.005em" },
  h4: { size: "1rem", line: "1.5rem", weight: 600, track: "0" },
  bodyLg: { size: "1rem", line: "1.5rem", weight: 400, track: "0" },
  body: { size: "0.875rem", line: "1.375rem", weight: 400, track: "0" },
  bodySm: { size: "0.8125rem", line: "1.25rem", weight: 400, track: "0" },
  label: { size: "0.75rem", line: "1rem", weight: 500, track: "0.01em" },
  overline: { size: "0.6875rem", line: "1rem", weight: 600, track: "0.08em" },
  button: { size: "0.875rem", line: "1.25rem", weight: 600, track: "0" },
  mono: { size: "0.875rem", line: "1.375rem", weight: 500, track: "0" },
} as const;

export const spacing = {
  1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80,
} as const;

export const radius = {
  sm: 6, md: 10, lg: 14, xl: 20, "2xl": 28, pill: 9999,
} as const;

export const motion = {
  fast: "120ms",
  base: "180ms",
  slow: "280ms",
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
  easeIn: "cubic-bezier(0.4, 0, 1, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

export const zIndex = {
  base: 0, sticky: 100, drawer: 200, modal: 300, toast: 400, tooltip: 500,
} as const;

export const breakpoints = {
  xs: 0, sm: 480, md: 768, lg: 1024, xl: 1280, "2xl": 1536,
} as const;

export type Density = "junior" | "aspirant" | "pro";

export const densityScalars: Record<
  Density,
  { space: number; type: number; radius: number; motion: number; touchTarget: number }
> = {
  junior: { space: 1.15, type: 1.05, radius: 1.1, motion: 1.15, touchTarget: 48 },
  aspirant: { space: 1, type: 1, radius: 1, motion: 1, touchTarget: 40 },
  pro: { space: 0.9, type: 0.95, radius: 0.85, motion: 0.7, touchTarget: 36 },
};

/** Aurora v2 token bundle — handy for tests / Storybook controls / canvas paints. */
export const aurora = {
  brand,
  semantic,
  auroraGradients,
  subjectColors,
  neutralRamp,
  masteryScale,
  typeScale,
  spacing,
  radius,
  motion,
  zIndex,
  breakpoints,
  densityScalars,
} as const;

export type AuroraTokens = typeof aurora;
