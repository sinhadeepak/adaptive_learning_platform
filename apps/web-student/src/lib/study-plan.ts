// Study plan client (Phase 6 S55).
//
// Backs the constrained plan editor — backend ships in 9f6d748:
//   GET  /plans/active           → currently-active plan + sessions
//   POST /plans/generate         → regenerate (caller passes minutes/target)
//   POST /plans/{plan_id}/edit   → apply move/swap/rest/shorten/add/etc.
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S55
// ADR:  docs/adr/0023-constrained-plan-coediting.md

import { auth } from "./api";

export type EditKind =
  | "move"
  | "swap"
  | "rest"
  | "shorten"
  | "add"
  | "regenerate"
  | "replace"
  | "postpone"
  | "split";

export type SessionKind =
  | "practice_concept"
  | "revise_concept"
  | "take_mock"
  | "watch_video"
  | "crash_drill"
  | "take_break";

export type SessionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "removed";

export interface PlanSession {
  id: string;
  planId: string;
  dayOffset: number;
  slot: string;
  kind: SessionKind | string;
  conceptId: string | null;
  topicId: string | null;
  expectedMinutes: number;
  expectedQuestions: number;
  isRequired: boolean;
  lockedReason: string | null;
  status: SessionStatus | string;
  completedAt: string | null;
  linkedSessionId: string | null;
  position: number;
}

export interface StudyPlan {
  id: string;
  userId: string;
  weekStart: string;
  targetDate: string | null;
  dailyMinutesGoal: number;
  source: "ai_initial" | "ai_regenerated" | "student_edited" | string;
  status: "active" | "archived" | string;
  sessions: PlanSession[];
}

interface RawPlanSession {
  id: string;
  plan_id: string;
  day_offset: number;
  slot: string;
  kind: string;
  concept_id: string | null;
  topic_id: string | null;
  expected_minutes: number;
  expected_questions: number;
  is_required: boolean;
  locked_reason: string | null;
  status: string;
  completed_at: string | null;
  linked_session_id: string | null;
  position: number;
}

interface RawStudyPlan {
  id: string;
  user_id: string;
  week_start: string;
  target_date: string | null;
  daily_minutes_goal: number;
  source: string;
  status: string;
  sessions: RawPlanSession[];
}

function camelizeSession(r: RawPlanSession): PlanSession {
  return {
    id: r.id,
    planId: r.plan_id,
    dayOffset: r.day_offset,
    slot: r.slot,
    kind: r.kind,
    conceptId: r.concept_id,
    topicId: r.topic_id,
    expectedMinutes: r.expected_minutes,
    expectedQuestions: r.expected_questions,
    isRequired: r.is_required,
    lockedReason: r.locked_reason,
    status: r.status,
    completedAt: r.completed_at,
    linkedSessionId: r.linked_session_id,
    position: r.position,
  };
}

function camelizePlan(raw: RawStudyPlan): StudyPlan {
  return {
    id: raw.id,
    userId: raw.user_id,
    weekStart: raw.week_start,
    targetDate: raw.target_date,
    dailyMinutesGoal: raw.daily_minutes_goal,
    source: raw.source,
    status: raw.status,
    sessions: (raw.sessions ?? []).map(camelizeSession),
  };
}

export type FetchActiveResult =
  | { kind: "found"; plan: StudyPlan }
  | { kind: "absent" };

export async function fetchActivePlan(): Promise<FetchActiveResult> {
  const r = await auth.fetch("/api/v1/plans/active");
  if (r.status === 404) return { kind: "absent" };
  if (!r.ok) throw new Error(`active plan fetch failed: HTTP ${r.status}`);
  const raw = (await r.json()) as RawStudyPlan;
  return { kind: "found", plan: camelizePlan(raw) };
}

export interface GeneratePlanOptions {
  dailyMinutesGoal?: number;
  targetDate?: string; // YYYY-MM-DD
  weakConcepts?: Array<Record<string, unknown>>;
  decays?: Array<Record<string, unknown>>;
  hasRecentMock?: boolean;
}

export async function generatePlan(
  opts: GeneratePlanOptions = {},
): Promise<StudyPlan> {
  const body = {
    daily_minutes_goal: opts.dailyMinutesGoal ?? 30,
    target_date: opts.targetDate ?? null,
    weak_concepts: opts.weakConcepts ?? [],
    decays: opts.decays ?? [],
    has_recent_mock: opts.hasRecentMock ?? false,
  };
  const r = await auth.fetch("/api/v1/plans/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`plan generate failed: HTTP ${r.status}`);
  return camelizePlan((await r.json()) as RawStudyPlan);
}

// ─── Edits ───────────────────────────────────────────────────────────

export interface EditPayload {
  kind: EditKind;
  sessionId?: string;
  toDayOffset?: number;
  newMinutes?: number;
  extras?: Record<string, unknown>;
}

export interface EditResponse {
  editId: string;
  impactPreview: Record<string, unknown> & { summary?: string };
  blocked: boolean;
  blockReason: string | null;
}

interface RawEditResponse {
  edit_id: string;
  impact_preview: Record<string, unknown> & { summary?: string };
  blocked: boolean;
  block_reason: string | null;
}

export async function editPlan(
  planId: string,
  payload: EditPayload,
): Promise<EditResponse> {
  const body: Record<string, unknown> = { kind: payload.kind };
  if (payload.sessionId) body.session_id = payload.sessionId;
  if (payload.toDayOffset !== undefined) body.to_day_offset = payload.toDayOffset;
  if (payload.newMinutes !== undefined) body.new_minutes = payload.newMinutes;
  if (payload.extras) body.extras = payload.extras;
  const r = await auth.fetch(`/api/v1/plans/${planId}/edit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`plan edit failed: HTTP ${r.status}`);
  const raw = (await r.json()) as RawEditResponse;
  return {
    editId: raw.edit_id,
    impactPreview: raw.impact_preview,
    blocked: raw.blocked,
    blockReason: raw.block_reason,
  };
}

// ─── Display helpers ─────────────────────────────────────────────────

export const SESSION_KIND_LABELS: Record<string, string> = {
  practice_concept: "Practice — weak concept",
  revise_concept: "Revise — fading recall",
  take_mock: "Mock — full pattern",
  watch_video: "Watch — short explainer",
  crash_drill: "Crash drill — high-yield",
  take_break: "Take a short break",
};

export function sessionKindLabel(kind: string): string {
  return SESSION_KIND_LABELS[kind] ?? kind;
}

export function dayOffsetLabel(offset: number, weekStart: string): string {
  // Render "Mon · May 12" etc. — caller passes the plan's weekStart.
  const start = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return `Day ${offset + 1}`;
  const d = new Date(start.getTime());
  d.setDate(d.getDate() + offset);
  const dow = d.toLocaleDateString(undefined, { weekday: "short" });
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${dow} · ${date}`;
}

export const _camelizePlanForTest = camelizePlan;
