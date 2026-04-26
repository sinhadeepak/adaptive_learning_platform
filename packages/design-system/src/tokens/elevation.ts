// Shadows from docs/ui/00_design-system.css:
//   --shadow-card:  0 2px 12px rgba(0,0,0,0.4)
//   --shadow-float: 0 8px 28px rgba(0,0,0,0.6)
//   --shadow-blue:  0 4px 20px rgba(79,135,246,0.35)
//   --shadow-ai:    0 4px 20px rgba(34,212,238,0.25)

export const elevation = {
  flat: "none",
  hover: "0 2px 12px rgba(0,0,0,0.4)", // --shadow-card (the dark theme uses heavier shadows)
  dropdown: "0 8px 28px rgba(0,0,0,0.6)", // --shadow-float
  focusRing: "0 0 0 3px rgba(79,135,246,0.35)", // brand blue glow
  shadowAi: "0 4px 20px rgba(34,212,238,0.25)", // --shadow-ai
  shadowBlue: "0 4px 20px rgba(79,135,246,0.35)", // --shadow-blue
} as const;

export type ElevationTokens = typeof elevation;
