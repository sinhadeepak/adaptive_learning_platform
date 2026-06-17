// Sprint 26 (P4-S26) — pure helpers for the topic-detail prereq pill.
//
// The gate endpoint returns canAttempt + missing[] + mastered[]. The pill
// renders three states: ready / master-X-first / hidden (no prereqs).

export interface GateTopicRef {
  topicId: string;
  title: string;
}

export interface GateResponse {
  topicId: string;
  userId: string;
  canAttempt: boolean;
  missing: GateTopicRef[];
  mastered: GateTopicRef[];
}

export type GatePillState =
  | { kind: "hidden" }
  | { kind: "ready" }
  | { kind: "blocked"; first: GateTopicRef; remaining: number };

/** Map a gate response into one of three rendering states. */
export function summariseGate(gate: GateResponse | null): GatePillState {
  if (gate === null) return { kind: "hidden" };
  // No prereqs at all (neither missing nor mastered) → topic is foundation,
  // pill hidden to avoid noise.
  if (gate.missing.length === 0 && gate.mastered.length === 0) {
    return { kind: "hidden" };
  }
  if (gate.canAttempt) {
    return { kind: "ready" };
  }
  return {
    kind: "blocked",
    first: gate.missing[0],
    remaining: Math.max(0, gate.missing.length - 1),
  };
}

/** Display label for the blocked state. */
export function blockedLabel(state: GatePillState & { kind: "blocked" }): string {
  if (state.remaining > 0) {
    return `Master ${state.first.title} first (+${state.remaining} more)`;
  }
  return `Master ${state.first.title} first`;
}
