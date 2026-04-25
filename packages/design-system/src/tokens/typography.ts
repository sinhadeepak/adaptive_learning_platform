// Typeface is TBD (Designer). Slots + scale are fixed.

export const typography = {
  family: {
    ui: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: '"JetBrains Mono", "Courier New", monospace',
  },
  scale: {
    pageTitle: { size: 20, weight: 600 },
    sectionHeading: { size: 16, weight: 600 },
    subheading: { size: 14, weight: 600 },
    body: { size: 14, weight: 400 },
    label: { size: 12, weight: 500 },
    hint: { size: 12, weight: 400 },
    badge: { size: 11, weight: 500 },
    micro: { size: 11, weight: 400 },
    columnHeader: { size: 11, weight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const },
    button: { sm: 12, md: 14, lg: 16, weight: 500 },
  },
} as const;

export type TypographyTokens = typeof typography;
