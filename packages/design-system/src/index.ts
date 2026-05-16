// @alp/design-system — Vidya v1 (formerly Aurora v2 + v1 legacy).
//
// This package is CSS-first: the canonical surface is the token,
// font, and density-scalar stylesheets under ./vidya/, consumed
// directly by app entry points:
//
//   import "@alp/design-system/vidya/tokens.css";
//   import "@alp/design-system/vidya/density-scalars.css";
//   import "@alp/design-system/vidya/fonts.css";
//
// The TS runtime surface (the old `tokens.colors.brand[600]`-style
// object) was retired in Phase 5 of the Vidya migration — no
// component consumed it, and Vidya's design intent is that
// components read CSS custom properties directly so theme +
// persona + density cascade for free.
//
// See: docs/02-design/design-system/ + ADR-0034.

export {};
