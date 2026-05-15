// Difficulty Agency client (Phase 6 S54).
//
// Backed by alp-learning routes from 8dbc309:
//   POST /adaptive/friction/check         — mid-quiz prompt evaluator
//   POST /adaptive/intent/theta-offset    — pre-quiz intent → θ̂ offset
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S54
// ADR:  docs/adr/0022-difficulty-agency.md
//
// NOTE — Quiz Go's /quiz/sessions/start endpoint doesn't accept
// intent_anchor yet (migration 010 added the column with DEFAULT
// 'match'; the app code wires it in a later sprint). For S54 v0 the
// selected intent is stored client-side per-topic and used to preview
// the effective θ̂ via /adaptive/intent/theta-offset. When the start
// endpoint accepts the field, the IntentSelector caller just passes it
// through and this file's behaviour doesn't change.

import { auth } from "./api";

// ─── Intent anchor (3-way enum) ──────────────────────────────────────

export type IntentAnchor = "match" | "push" | "build_confidence";

export const INTENT_LABELS: Record<IntentAnchor, string> = {
  match: "Match my level",
  push: "Push me",
  build_confidence: "Build confidence",
};

export const INTENT_GLYPHS: Record<IntentAnchor, string> = {
  match: "=",
  push: "↑",
  build_confidence: "↓",
};

export const INTENT_DESCRIPTIONS: Record<IntentAnchor, string> = {
  match:
    "The default. The engine picks items at your current ability — accuracy lands around 60-70%.",
  push:
    "Aim above your level. The engine biases item selection upward by ~0.4 θ̂; expect harder questions and lower accuracy.",
  build_confidence:
    "Aim below your level. The engine biases item selection downward by ~0.4 θ̂; expect easier questions for a confidence run.",
};

// ─── Friction check ──────────────────────────────────────────────────

export interface FrictionItemAttempt {
  itemIdx: number;
  isCorrect?: boolean | null;
  timeSpentMs?: number | null;
  skipped?: boolean;
}

export type FrictionReason =
  | "repeated_wrong"
  | "fast_correct"
  | "long_hesitation"
  | "repeated_skip";

export type FrictionAction = "easier" | "harder" | "same";

export interface FrictionTrigger {
  reason: FrictionReason;
  suggestedOffset: number;
  suggestedAction: FrictionAction;
  message: string;
}

interface RawFrictionResponse {
  trigger: null | {
    reason: FrictionReason;
    suggested_offset: number;
    suggested_action: FrictionAction;
    message: string;
  };
}

export async function checkFriction(
  history: FrictionItemAttempt[],
  lastFrictionAtIdx: number | null,
): Promise<FrictionTrigger | null> {
  const body = {
    history: history.map((a) => ({
      item_idx: a.itemIdx,
      is_correct: a.isCorrect ?? null,
      time_spent_ms: a.timeSpentMs ?? null,
      skipped: a.skipped ?? false,
    })),
    last_friction_at_idx: lastFrictionAtIdx,
  };
  const r = await auth.fetch("/api/v1/adaptive/friction/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`friction check failed: HTTP ${r.status}`);
  }
  const raw = (await r.json()) as RawFrictionResponse;
  if (raw.trigger === null) return null;
  return {
    reason: raw.trigger.reason,
    suggestedOffset: raw.trigger.suggested_offset,
    suggestedAction: raw.trigger.suggested_action,
    message: raw.trigger.message,
  };
}

// ─── Intent → θ̂ offset preview ──────────────────────────────────────

export interface IntentOffset {
  intentAnchor: IntentAnchor;
  offset: number;
  effectiveTheta: number;
}

interface RawIntentResponse {
  intent_anchor: IntentAnchor;
  offset: number;
  effective_theta: number;
}

export async function previewIntentOffset(
  intentAnchor: IntentAnchor,
  thetaHat = 0,
): Promise<IntentOffset> {
  const r = await auth.fetch("/api/v1/adaptive/intent/theta-offset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intent_anchor: intentAnchor,
      theta_hat: thetaHat,
    }),
  });
  if (!r.ok) {
    throw new Error(`intent offset failed: HTTP ${r.status}`);
  }
  const raw = (await r.json()) as RawIntentResponse;
  return {
    intentAnchor: raw.intent_anchor,
    offset: raw.offset,
    effectiveTheta: raw.effective_theta,
  };
}

// ─── localStorage helpers ────────────────────────────────────────────
//
// Two scopes:
//   - per-topic intent: persists between sessions on the same topic
//   - first-quiz seen: gates the AdaptsExplainerCard on Home

const INTENT_KEY_PREFIX = "quiz.intent.v1.";
const FIRST_QUIZ_KEY = "quiz.adapt_explainer.seen.v1";

export function loadIntentForTopic(
  topicId: string,
): IntentAnchor | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(INTENT_KEY_PREFIX + topicId);
    if (raw === "match" || raw === "push" || raw === "build_confidence") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveIntentForTopic(
  topicId: string,
  intent: IntentAnchor,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INTENT_KEY_PREFIX + topicId, intent);
  } catch {
    /* storage may be disabled — ignore */
  }
}

export function hasSeenAdaptsExplainer(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(FIRST_QUIZ_KEY) === "1";
  } catch {
    return true;
  }
}

export function markAdaptsExplainerSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FIRST_QUIZ_KEY, "1");
  } catch {
    /* ignore */
  }
}

// ─── Friction reason → display copy ──────────────────────────────────

export function frictionReasonLabel(reason: FrictionReason): string {
  switch (reason) {
    case "repeated_wrong":
      return "Three wrong in a row";
    case "fast_correct":
      return "Cruising through";
    case "long_hesitation":
      return "Long hesitation";
    case "repeated_skip":
      return "Two skips in a row";
  }
}
