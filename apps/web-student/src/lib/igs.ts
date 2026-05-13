// IGS — Internal Guidance System client.
//
// Two surfaces:
//   • HTTP via auth.fetch (today-plan, next-action, override)
//   • WebSocket subscriber for `igs.next-action.updated` / `igs.plan.updated`
//
// The WS layer mirrors alp-battle's pattern: JSON envelopes `{t, p}`,
// JWT-in-querystring auth, single connection per tab, reconnect with
// backoff. We deliberately keep this lightweight — no global store, no
// React context. Components subscribe via `connectIGS()` and dispose
// via the returned `close()` handle.

import { auth } from "./api";

export interface IGSAction {
  actionKind: string;
  conceptId: string | null;
  blueprintId?: string | null;
  expectedMinutes: number;
  questionCount: number | null;
  score: number;
  rank: number;
  rationale: string[];
  expectedMarksGained: number;
}

export interface NextActionPayload {
  examId: string;
  chosen: IGSAction;
  alternatives: IGSAction[];
  confidence: number;
}

export interface TodayPlanResponse {
  user_id: string;
  exam_id: string;
  generated_at: string;
  total_minutes: number;
  target_minutes?: number | null;
  // The server's schema names this `plan`; we surface it as `actions`
  // in the UI for clarity. Normalised at parse time below.
  plan: Array<{
    action_kind: string;
    concept_id: string | null;
    blueprint_id: string | null;
    question_count: number | null;
    expected_minutes: number;
    score: number;
    rank: number;
    rationale: string[];
    expected_marks_gained: number;
  }>;
}

export async function fetchTodayPlan(
  userId: string,
  examId: string,
): Promise<TodayPlanResponse | null> {
  const r = await auth.fetch(
    `/api/v1/igs/${userId}/today-plan?exam_id=${encodeURIComponent(examId)}`,
  );
  if (!r.ok) return null;
  return (await r.json()) as TodayPlanResponse;
}

export async function fetchExplainability(
  userId: string,
  actionId: string,
): Promise<{ rationale: string[]; alternatives: string[] } | null> {
  const r = await auth.fetch(
    `/api/v1/igs/${userId}/explainability/${encodeURIComponent(actionId)}`,
  );
  if (!r.ok) return null;
  return (await r.json()) as { rationale: string[]; alternatives: string[] };
}

export async function postOverride(
  userId: string,
  body: {
    chosen_action_kind: string;
    concept_id?: string | null;
    rejected_top_action_id?: string | null;
    reason?: string;
  },
): Promise<void> {
  await auth.fetch(`/api/v1/igs/${userId}/override`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── WebSocket subscriber ──────────────────────────────────────────────

type Envelope =
  | { t: "igs.next-action.updated"; p: NextActionPayload }
  | { t: "igs.plan.updated"; p: { examId: string } }
  | { t: "igs.recommendation.expired"; p: Record<string, unknown> }
  | { t: "igs.heartbeat" }
  | { t: "igs.error"; p: { code: string; message: string } };

export interface IGSStreamHandle {
  close(): void;
}

export interface IGSStreamOptions {
  examId: string;
  onNextAction?(p: NextActionPayload): void;
  onPlanUpdated?(p: { examId: string }): void;
  onExpired?(): void;
  onError?(err: { code: string; message: string }): void;
}

export function connectIGS(opts: IGSStreamOptions): IGSStreamHandle {
  let closed = false;
  let ws: WebSocket | null = null;
  let backoffMs = 1000;

  function open() {
    if (closed) return;
    const tokens = auth.getTokens();
    if (!tokens) {
      // Not logged in — retry shortly in case auth races the mount.
      setTimeout(open, 1500);
      return;
    }
    // Use the same origin so nginx proxies /api/v1/igs/stream to learning.
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/api/v1/igs/stream`
      + `?token=${encodeURIComponent(tokens.accessToken)}`
      + `&exam_id=${encodeURIComponent(opts.examId)}`;
    ws = new WebSocket(url);
    ws.addEventListener("open", () => {
      backoffMs = 1000;
      ws?.send(JSON.stringify({ t: "igs.subscribe", p: { examId: opts.examId } }));
    });
    ws.addEventListener("message", (ev) => {
      let env: Envelope;
      try { env = JSON.parse(ev.data) as Envelope; } catch { return; }
      switch (env.t) {
        case "igs.next-action.updated": opts.onNextAction?.(env.p); break;
        case "igs.plan.updated":        opts.onPlanUpdated?.(env.p); break;
        case "igs.recommendation.expired": opts.onExpired?.(); break;
        case "igs.error":               opts.onError?.(env.p); break;
        case "igs.heartbeat":           /* keep-alive */ break;
      }
    });
    ws.addEventListener("close", () => {
      if (closed) return;
      const wait = Math.min(backoffMs, 30_000);
      backoffMs = Math.min(backoffMs * 2, 30_000);
      setTimeout(open, wait);
    });
    ws.addEventListener("error", () => { ws?.close(); });
  }

  open();

  return {
    close() {
      closed = true;
      ws?.close();
    },
  };
}
