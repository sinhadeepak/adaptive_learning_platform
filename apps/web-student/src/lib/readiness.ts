// Readiness bands + topic decay client (Phase 6 S56).
//
// Backs the S56 surfaces — endpoints shipped in d4ec8d0:
//   GET /analytics/topic-decay/{user_id}
//   GET /analytics/readiness-band/{user_id}?target_score=&days_to_exam=
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S56

import { auth } from "./api";
import type { DecaySeverity, ReadinessBand } from "./insights";

// ─── Topic decay ────────────────────────────────────────────────────

export interface DecayedConcept {
  conceptId: string;
  ewa: number;
  n: number;
  decayDays: number;
  decaySeverity: DecaySeverity;
}

interface RawDecayItem {
  concept_id: string;
  ewa: number;
  n: number;
  decay_days: number;
  decay_severity: DecaySeverity;
}

export async function fetchTopicDecay(
  userId: string,
): Promise<DecayedConcept[]> {
  const r = await auth.fetch(`/api/v1/analytics/topic-decay/${userId}`);
  if (!r.ok) throw new Error(`topic decay fetch failed: HTTP ${r.status}`);
  const body = (await r.json()) as { items: RawDecayItem[] };
  return (body.items ?? []).map((i) => ({
    conceptId: i.concept_id,
    ewa: i.ewa,
    n: i.n,
    decayDays: i.decay_days,
    decaySeverity: i.decay_severity,
  }));
}

// ─── Readiness band ─────────────────────────────────────────────────

export interface ReadinessBandResult {
  userId: string;
  readinessScore: number; // [0, 1]
  targetScore: number;
  daysToExam: number;
  band: ReadinessBand;
  actions: string[];
}

interface RawReadinessBand {
  user_id: string;
  readiness_score: number;
  target_score: number;
  days_to_exam: number;
  band: ReadinessBand;
  actions: string[];
}

export async function fetchReadinessBand(
  userId: string,
  opts: { targetScore?: number; daysToExam?: number } = {},
): Promise<ReadinessBandResult> {
  const qs = new URLSearchParams();
  if (opts.targetScore != null) qs.set("target_score", String(opts.targetScore));
  if (opts.daysToExam != null) qs.set("days_to_exam", String(opts.daysToExam));
  const url = `/api/v1/analytics/readiness-band/${userId}${qs.toString() ? `?${qs}` : ""}`;
  const r = await auth.fetch(url);
  if (!r.ok) throw new Error(`readiness band fetch failed: HTTP ${r.status}`);
  const raw = (await r.json()) as RawReadinessBand;
  return {
    userId: raw.user_id,
    readinessScore: raw.readiness_score,
    targetScore: raw.target_score,
    daysToExam: raw.days_to_exam,
    band: raw.band,
    actions: raw.actions ?? [],
  };
}

// ─── Display helpers ────────────────────────────────────────────────

/** Returns ↓ for fading, ↑ for fresh, — for steady. */
export function decayArrow(severity: DecaySeverity): "↓" | "↑" | "—" {
  switch (severity) {
    case "critical":
    case "stale":
      return "↓";
    case "fresh":
      return "↑";
    case "aging":
      return "—";
  }
}

export function decayArrowTone(
  severity: DecaySeverity,
): "danger" | "warning" | "success" | "neutral" {
  switch (severity) {
    case "critical":
      return "danger";
    case "stale":
      return "warning";
    case "aging":
      return "neutral";
    case "fresh":
      return "success";
  }
}
