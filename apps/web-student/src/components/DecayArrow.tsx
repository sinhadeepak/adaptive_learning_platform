// DecayArrow — tiny inline arrow showing concept decay (Phase 6 S56).
//
// Used on Insights tiles, Home, and Topic detail to surface decay
// without taking up a full row. Renders ↑ / ↓ / — plus optional days.

import { decayArrow, decayArrowTone } from "../lib/readiness";
import type { DecaySeverity } from "../lib/insights";

export interface DecayArrowProps {
  severity: DecaySeverity;
  /** Optional decay days — when present, renders as " · 14d". */
  decayDays?: number;
  /** When true, shrinks padding for inline use inside compact rows. */
  inline?: boolean;
}

export function DecayArrow({
  severity,
  decayDays,
  inline = false,
}: DecayArrowProps) {
  const arrow = decayArrow(severity);
  const tone = decayArrowTone(severity);
  return (
    <span
      className={`decay-arrow decay-arrow-${tone}${inline ? " is-inline" : ""}`}
      aria-label={`decay ${severity}`}
      title={`Decay severity: ${severity}`}
    >
      <span className="decay-arrow-glyph" aria-hidden>
        {arrow}
      </span>
      {decayDays !== undefined && (
        <span className="decay-arrow-days">{decayDays}d</span>
      )}
    </span>
  );
}
