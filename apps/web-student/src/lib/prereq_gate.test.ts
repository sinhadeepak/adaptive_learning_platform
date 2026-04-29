// Sprint 26 (P4-S26) — pure-function tests for the prereq-pill state.

import { describe, expect, it } from "vitest";

import { blockedLabel, summariseGate, type GateResponse } from "./prereq_gate";

const BASE: Omit<GateResponse, "missing" | "mastered" | "canAttempt"> = {
  topicId: "t-rotational",
  userId: "u-1",
};

describe("summariseGate", () => {
  it("returns hidden when gate is null", () => {
    expect(summariseGate(null)).toEqual({ kind: "hidden" });
  });

  it("returns hidden when topic has no prereqs at all", () => {
    const gate: GateResponse = {
      ...BASE,
      canAttempt: true,
      missing: [],
      mastered: [],
    };
    expect(summariseGate(gate)).toEqual({ kind: "hidden" });
  });

  it("returns ready when canAttempt is true and prereqs exist (mastered)", () => {
    const gate: GateResponse = {
      ...BASE,
      canAttempt: true,
      missing: [],
      mastered: [{ topicId: "t-mech", title: "Mechanics" }],
    };
    expect(summariseGate(gate)).toEqual({ kind: "ready" });
  });

  it("returns blocked with first missing prereq + remaining count", () => {
    const gate: GateResponse = {
      ...BASE,
      canAttempt: false,
      missing: [
        { topicId: "t-mech", title: "Mechanics" },
        { topicId: "t-calc", title: "Calculus" },
      ],
      mastered: [],
    };
    const state = summariseGate(gate);
    expect(state.kind).toBe("blocked");
    if (state.kind === "blocked") {
      expect(state.first.title).toBe("Mechanics");
      expect(state.remaining).toBe(1);
    }
  });
});

describe("blockedLabel", () => {
  it("renders single-prereq label without count", () => {
    const label = blockedLabel({
      kind: "blocked",
      first: { topicId: "t-mech", title: "Mechanics" },
      remaining: 0,
    });
    expect(label).toBe("Master Mechanics first");
  });

  it("renders multi-prereq label with remaining count", () => {
    const label = blockedLabel({
      kind: "blocked",
      first: { topicId: "t-mech", title: "Mechanics" },
      remaining: 2,
    });
    expect(label).toBe("Master Mechanics first (+2 more)");
  });
});
