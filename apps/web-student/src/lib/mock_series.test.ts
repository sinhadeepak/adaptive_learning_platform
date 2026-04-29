// Sprint 25 (P4-S25) — pure-function tests for mock series helpers.

import { describe, expect, it } from "vitest";

import {
  formatPct,
  summariseAttempt,
  type SectionBreakdown,
  type SessionRow,
} from "./mock_series";

const SESSION: SessionRow = {
  sessionId: "sess-1",
  blueprintId: "bp-1",
  status: "SUBMITTED",
  startedAt: "2026-04-28T10:00:00Z",
  submittedAt: "2026-04-28T11:30:00Z",
  servedCount: 60,
  correctCount: 36,
};

describe("summariseAttempt", () => {
  it("computes accuracy from servedCount / correctCount", () => {
    const s = summariseAttempt(SESSION);
    expect(s.accuracy).toBeCloseTo(0.6, 6);
    expect(s.weakestSection).toBeNull();
  });

  it("returns zero accuracy when no questions served", () => {
    const s = summariseAttempt({
      ...SESSION,
      servedCount: 0,
      correctCount: 0,
    });
    expect(s.accuracy).toBe(0);
  });

  it("identifies the weakest section by accuracy", () => {
    const breakdown: SectionBreakdown[] = [
      { sectionId: "physics", servedCount: 20, correctCount: 16, totalTimeMs: 0, accuracy: 0.8 },
      { sectionId: "chemistry", servedCount: 20, correctCount: 8, totalTimeMs: 0, accuracy: 0.4 },
      { sectionId: "maths", servedCount: 20, correctCount: 12, totalTimeMs: 0, accuracy: 0.6 },
    ];
    const s = summariseAttempt(SESSION, breakdown);
    expect(s.weakestSection?.sectionId).toBe("chemistry");
    expect(s.weakestSection?.accuracy).toBeCloseTo(0.4, 6);
  });

  it("ignores sections with zero served when computing weakest", () => {
    const breakdown: SectionBreakdown[] = [
      { sectionId: "physics", servedCount: 0, correctCount: 0, totalTimeMs: 0, accuracy: 0 },
      { sectionId: "chemistry", servedCount: 25, correctCount: 15, totalTimeMs: 0, accuracy: 0.6 },
    ];
    const s = summariseAttempt(SESSION, breakdown);
    expect(s.weakestSection?.sectionId).toBe("chemistry");
  });
});

describe("formatPct", () => {
  it("renders 0–1 floats as percent", () => {
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(0.6)).toBe("60%");
    expect(formatPct(1)).toBe("100%");
  });

  it("returns em-dash on non-finite", () => {
    expect(formatPct(Number.NaN)).toBe("—");
    expect(formatPct(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
