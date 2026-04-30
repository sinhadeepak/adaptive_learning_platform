// Sprint 32 (P4-S32) — pure helpers for the per-topic peer-percentile pill.
//
// The endpoint hides the result when cohort < 30 (NFR-P4-06). The pill
// renders three states: hidden / visible-with-band / cold-start.

export interface PeerPercentileResp {
  userId: string;
  examId: string;
  topicId: string;
  hidden: boolean;
  reason?: string;
  cohortSize: number;
  thresholdRequired?: number;
  percentile?: number;
  userEwa?: number;
}

export type PercentilePillBand = "top" | "high" | "mid" | "low";

export interface PercentilePillState {
  visible: boolean;
  /** When hidden, why — drives a small disclosure to the user. */
  hideReason?: string;
  /** Visible-state-only fields */
  label?: string; // "67th percentile (N=230)"
  band?: PercentilePillBand;
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = Math.round(n) % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function bandFor(percentile: number): PercentilePillBand {
  if (percentile >= 90) return "top";
  if (percentile >= 70) return "high";
  if (percentile >= 30) return "mid";
  return "low";
}

export function pillState(resp: PeerPercentileResp | null): PercentilePillState {
  if (resp === null) return { visible: false };
  if (resp.hidden) {
    return { visible: false, hideReason: resp.reason };
  }
  if (resp.percentile === undefined) return { visible: false };
  const pct = Math.round(resp.percentile);
  return {
    visible: true,
    label: `${pct}${ordinalSuffix(pct)} percentile (N=${resp.cohortSize})`,
    band: bandFor(resp.percentile),
  };
}
