// Authoritative palette — source of truth is docs/ui/01_StudentPortal_Web/00_design-system.css
// (the runtime CSS custom properties). These TypeScript constants mirror the
// SAME values so existing primitives that still hardcode colour-by-import keep
// working, but new code SHOULD prefer reading the CSS custom property
// (`var(--color-blue)` etc.) so a portal-level accent override flows through.

export const colors = {
  // --- semantic legacy names (kept for backwards compat with existing primitives) ---
  brand: {
    primary: "#4F87F6", // --color-blue
    primaryHover: "#3D6FE0",
    secondary: "#22D4EE", // --color-ai (cyan accent)
    tint: "rgba(79,135,246,0.12)",
    focusRing: "rgba(79,135,246,0.35)",
  },
  semantic: {
    success: { fg: "#10C47A", bg: "rgba(16,196,122,0.12)" }, // --color-green
    warning: { fg: "#F5A623", bg: "rgba(245,166,35,0.12)" }, // --color-amber
    danger: { fg: "#F43F5E", bg: "rgba(244,63,94,0.12)" }, // --color-red
    info: { fg: "#22D4EE", bg: "rgba(34,212,238,0.10)" }, // AI accent
  },
  surface: {
    primary: "#0C1422", // --bg-surface1 — sidebar, panels (was #FFFFFF in legacy light theme)
    secondary: "#101A30", // --bg-surface2 — cards
    tertiary: "#162038", // --bg-surface3 — input bg
  },
  border: {
    default: "rgba(255,255,255,0.07)", // --border
    strong: "rgba(255,255,255,0.11)", // --border-strong
  },
  text: {
    primary: "#EEF2FF", // --text-primary (was #0F172A in light)
    secondary: "#B8C5E0", // --text-secondary
    muted: "#7A8BAD", // --text-muted
    disabled: "#3E4D6A", // --text-faint
  },

  // --- direct token names matching docs/ui (preferred for new code) ---
  bg: {
    base: "#07090F",
    surface1: "#0C1422",
    surface2: "#101A30",
    surface3: "#162038",
    surface4: "#1B2844",
  },
  accent: {
    ai: "#22D4EE",
    blue: "#4F87F6",
    blue2: "#7B68EE",
    green: "#10C47A",
    amber: "#F5A623",
    red: "#F43F5E",
    purple: "#A78BFA",
  },
  // Strength buckets — bucketized by analytics EWA in [0, 1]:
  //   ≥0.70 strong / 0.40-0.69 developing / 0.01-0.39 weak / 0 not_started
  strength: {
    strong: "#10C47A",
    developing: "#4F87F6",
    weak: "#F43F5E",
    notStarted: "#3E4D6A",
  },
} as const;

export type ColorTokens = typeof colors;
