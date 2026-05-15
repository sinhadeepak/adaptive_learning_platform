export { colors } from "./colors";
export type { ColorTokens } from "./colors";

export { typography } from "./typography";
export type { TypographyTokens } from "./typography";

export { spacing } from "./spacing";
export type { SpacingTokens, SpacingKey } from "./spacing";

export { radius } from "./shape";
export type { RadiusTokens } from "./shape";

export { elevation } from "./elevation";
export type { ElevationTokens } from "./elevation";

import { colors } from "./colors";
import { typography } from "./typography";
import { spacing } from "./spacing";
import { radius } from "./shape";
import { elevation } from "./elevation";

export const tokens = {
  colors,
  typography,
  spacing,
  radius,
  elevation,
} as const;

export type Tokens = typeof tokens;

// ───── Aurora v2 tokens (additive — see docs/02-design/design-system-v2-aurora.md) ─────
export {
  aurora,
  bucketForEwa,
} from "./v2";
export type {
  AuroraTokens,
  MasteryBucket,
  Density,
} from "./v2";
