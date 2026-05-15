// Insights hub client (Phase 6 S52).
//
// Backed by `GET /analytics/insights/{user_id}/snapshot` (shipped in
// commit 9497394). Single batched call replaces 6 round-trips that
// the legacy concept-profile / syllabus / readiness / decay routes
// would have needed.
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S52
// ADR: docs/adr/0020-ux-copilot-scope-and-ia.md

import { auth } from "./api";

// ─── Shared row shape ──────────────────────────────────────────────
//
// Aggregator returns top-10 concept_mastery rows annotated with decay
// severity (fresh / aging / stale / critical) + decay days since the
// concept was last attempted.

export type DecaySeverity = "fresh" | "aging" | "stale" | "critical";

export interface ConceptRow {
  conceptId: string;
  ewa: number;
  n: number;
  decaySeverity: DecaySeverity;
  decayDays: number;
}

// Phase-6 S56 readiness bands. Server emits one of these (or null
// while the data is warming up).
export type ReadinessBand =
  | "approaching"
  | "on_track"
  | "behind"
  | "at_risk";

export interface ReadinessSummary {
  score: number; // [0, 1]
  band: ReadinessBand;
}

// ─── 3-zone payload ────────────────────────────────────────────────

export interface InsightsMyState {
  conceptMastery: ConceptRow[];
  topicDecay: ConceptRow[];
  readiness: ReadinessSummary | null;
}

export interface InsightsWhatThisMeans {
  weakConcepts: ConceptRow[];
  decayAlerts: ConceptRow[];
}

export interface InsightsWhatToDo {
  missionsTodayPending: boolean;
  revisionDueToday: number;
}

export interface InsightsSnapshot {
  userId: string;
  myState: InsightsMyState;
  whatThisMeans: InsightsWhatThisMeans;
  whatToDo: InsightsWhatToDo;
}

// Server payload (snake_case as returned by the FastAPI route) — kept
// as a separate type so the camelCase conversion is explicit.
interface RawConceptRow {
  concept_id: string;
  ewa: number;
  n: number;
  decay_severity: DecaySeverity;
  decay_days: number;
}

interface RawInsightsSnapshot {
  user_id: string;
  my_state: {
    concept_mastery: RawConceptRow[];
    topic_decay: RawConceptRow[];
    readiness: { score: number; band: ReadinessBand } | null;
  };
  what_this_means: {
    weak_concepts: RawConceptRow[];
    decay_alerts: RawConceptRow[];
  };
  what_to_do: {
    missions_today_pending: boolean;
    revision_due_today: number;
  };
}

function camelizeConcept(r: RawConceptRow): ConceptRow {
  return {
    conceptId: r.concept_id,
    ewa: r.ewa,
    n: r.n,
    decaySeverity: r.decay_severity,
    decayDays: r.decay_days,
  };
}

function camelize(raw: RawInsightsSnapshot): InsightsSnapshot {
  return {
    userId: raw.user_id,
    myState: {
      conceptMastery: (raw.my_state.concept_mastery ?? []).map(camelizeConcept),
      topicDecay: (raw.my_state.topic_decay ?? []).map(camelizeConcept),
      readiness: raw.my_state.readiness,
    },
    whatThisMeans: {
      weakConcepts: (raw.what_this_means.weak_concepts ?? []).map(
        camelizeConcept,
      ),
      decayAlerts: (raw.what_this_means.decay_alerts ?? []).map(
        camelizeConcept,
      ),
    },
    whatToDo: {
      missionsTodayPending: raw.what_to_do.missions_today_pending,
      revisionDueToday: raw.what_to_do.revision_due_today,
    },
  };
}

export async function fetchInsightsSnapshot(
  userId: string,
): Promise<InsightsSnapshot> {
  const r = await auth.fetch(
    `/api/v1/analytics/insights/${userId}/snapshot`,
  );
  if (!r.ok) {
    throw new Error(`insights snapshot failed: HTTP ${r.status}`);
  }
  const raw = (await r.json()) as RawInsightsSnapshot;
  return camelize(raw);
}

// ─── Display helpers ───────────────────────────────────────────────

export function readinessBandLabel(band: ReadinessBand): string {
  switch (band) {
    case "approaching":
      return "Approaching target";
    case "on_track":
      return "On track";
    case "behind":
      return "Behind pace";
    case "at_risk":
      return "At risk";
  }
}

export function readinessBandTone(
  band: ReadinessBand,
): "success" | "info" | "warning" | "danger" {
  switch (band) {
    case "approaching":
      return "success";
    case "on_track":
      return "info";
    case "behind":
      return "warning";
    case "at_risk":
      return "danger";
  }
}

export function decaySeverityLabel(s: DecaySeverity): string {
  switch (s) {
    case "fresh":
      return "Fresh";
    case "aging":
      return "Aging";
    case "stale":
      return "Stale";
    case "critical":
      return "Critical";
  }
}

/** EXPOSED for testing — camelize a raw aggregator payload. */
export const _camelizeForTest = camelize;
