// Typeface + scale per docs/ui/01_StudentPortal_Web/00_design-system.css.
// Outfit is the canonical UI font; Space Mono for code/numerics.

export const typography = {
  family: {
    ui: '"Outfit", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: '"Space Mono", "Fira Code", "JetBrains Mono", monospace',
  },
  scale: {
    pageTitle: { size: 20, weight: 600 },
    sectionHeading: { size: 16, weight: 600 },
    subheading: { size: 14, weight: 600 },
    body: { size: 13, weight: 400 }, // 13px base per design-system.css
    label: { size: 12, weight: 500 },
    hint: { size: 12, weight: 400 },
    badge: { size: 11, weight: 500 },
    micro: { size: 11, weight: 400 },
    columnHeader: {
      size: 11,
      weight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase" as const,
    },
    button: { sm: 12, md: 13, lg: 14, weight: 500 },
  },
} as const;

export type TypographyTokens = typeof typography;
