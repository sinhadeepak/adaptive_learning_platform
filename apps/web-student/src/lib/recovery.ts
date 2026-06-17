// Recovery proposal client (Phase 6 S57, UX-29).
//
// Backs the recovery-mode FSM that fires when a student misses 2+
// planned sessions in a row. Endpoints from 92efa83:
//   GET  /recovery/active
//   POST /recovery/{rid}/accept
//   POST /recovery/{rid}/decline

import { auth } from "./api";

export type RecoveryStatus = "pending" | "accepted" | "declined" | "expired";

export interface RecoveryProposal {
  id: string;
  planId: string;
  triggeredAt: string;
  missedSessionIds: string[];
  catchUpPayload: Record<string, unknown>;
  rationale: string;
  expectedMinutes: number;
  status: RecoveryStatus;
}

interface RawProposal {
  id: string;
  plan_id: string;
  triggered_at: string;
  missed_session_ids: string[];
  catch_up_payload: Record<string, unknown>;
  rationale: string;
  expected_minutes: number;
  status: RecoveryStatus;
}

export type FetchActiveRecovery =
  | { kind: "found"; proposal: RecoveryProposal }
  | { kind: "absent" };

export async function fetchActiveRecovery(): Promise<FetchActiveRecovery> {
  const r = await auth.fetch("/api/v1/recovery/active");
  if (!r.ok)
    throw new Error(`active recovery fetch failed: HTTP ${r.status}`);
  const raw = (await r.json()) as { proposal: RawProposal | null };
  if (raw.proposal === null) return { kind: "absent" };
  const p = raw.proposal;
  return {
    kind: "found",
    proposal: {
      id: p.id,
      planId: p.plan_id,
      triggeredAt: p.triggered_at,
      missedSessionIds: p.missed_session_ids ?? [],
      catchUpPayload: p.catch_up_payload ?? {},
      rationale: p.rationale,
      expectedMinutes: p.expected_minutes,
      status: p.status,
    },
  };
}

export async function acceptRecovery(rid: string): Promise<RecoveryStatus> {
  const r = await auth.fetch(`/api/v1/recovery/${rid}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!r.ok) throw new Error(`recovery accept failed: HTTP ${r.status}`);
  const raw = (await r.json()) as { status: RecoveryStatus };
  return raw.status;
}

export async function declineRecovery(rid: string): Promise<RecoveryStatus> {
  const r = await auth.fetch(`/api/v1/recovery/${rid}/decline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!r.ok) throw new Error(`recovery decline failed: HTTP ${r.status}`);
  const raw = (await r.json()) as { status: RecoveryStatus };
  return raw.status;
}
