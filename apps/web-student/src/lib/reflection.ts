// Reflection + commitment client (Phase 6 S57, UX-27).
//
// Backs the reflection-and-commitment loop. Endpoints from 92efa83:
//   POST /reflections                  — record a reflection + commitment
//   POST /commitments/{rid}/check-in   — kept/missed + note
//   GET  /commitments/{user_id}?status — list commitments by status
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S57

import { auth } from "./api";

export type ReflectionTrigger = "session" | "mock" | "weekly";
export type CommitmentStatus = "pending" | "kept" | "missed";

export interface ReflectionPayload {
  userId: string;
  trigger: ReflectionTrigger;
  triggerArtifactId?: string;
  promptId?: string;
  response?: string;
  commitment?: string;
  /** ISO timestamp the commitment is due. Optional. */
  commitmentDueAt?: string;
}

export async function postReflection(
  payload: ReflectionPayload,
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    user_id: payload.userId,
    trigger: payload.trigger,
    prompt_id: payload.promptId ?? "default_prompt",
    response: payload.response ?? null,
    commitment: payload.commitment ?? null,
  };
  if (payload.triggerArtifactId)
    body.trigger_artifact_id = payload.triggerArtifactId;
  if (payload.commitmentDueAt) body.commitment_due_at = payload.commitmentDueAt;
  const r = await auth.fetch("/api/v1/reflections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`reflection post failed: HTTP ${r.status}`);
  const raw = (await r.json()) as { id: string };
  return { id: raw.id };
}

export interface Commitment {
  id: string;
  trigger: ReflectionTrigger;
  promptId: string;
  commitment: string;
  commitmentDueAt: string | null;
  commitmentStatus: CommitmentStatus;
  occurredAt: string;
  lastCheckInAt: string | null;
}

interface RawCommitment {
  id: string;
  trigger: ReflectionTrigger;
  prompt_id: string;
  commitment: string;
  commitment_due_at: string | null;
  commitment_status: CommitmentStatus;
  occurred_at: string;
  last_check_in_at: string | null;
}

export async function listCommitments(
  userId: string,
  status?: CommitmentStatus,
): Promise<Commitment[]> {
  const qs = status ? `?status=${status}` : "";
  const r = await auth.fetch(`/api/v1/commitments/${userId}${qs}`);
  if (!r.ok) throw new Error(`commitments fetch failed: HTTP ${r.status}`);
  const raw = (await r.json()) as RawCommitment[] | { items: RawCommitment[] };
  const arr = Array.isArray(raw) ? raw : (raw.items ?? []);
  return arr.map((c) => ({
    id: c.id,
    trigger: c.trigger,
    promptId: c.prompt_id,
    commitment: c.commitment,
    commitmentDueAt: c.commitment_due_at,
    commitmentStatus: c.commitment_status,
    occurredAt: c.occurred_at,
    lastCheckInAt: c.last_check_in_at,
  }));
}

export async function checkInCommitment(
  rid: string,
  kept: boolean,
  note?: string,
): Promise<CommitmentStatus> {
  const r = await auth.fetch(`/api/v1/commitments/${rid}/check-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kept, note: note ?? null }),
  });
  if (!r.ok) throw new Error(`check-in failed: HTTP ${r.status}`);
  const raw = (await r.json()) as { commitment_status: CommitmentStatus };
  return raw.commitment_status;
}
