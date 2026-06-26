import { describe, expect, it } from "vitest";
import {
  mergeRecent,
  normalizeMockAttempt,
  normalizePracticeSession,
  relativeTime,
  type RawMockAttempt,
  type RawSession,
} from "./recentActivity";

const mock = (over: Partial<RawMockAttempt> = {}): RawMockAttempt => ({
  id: "m1",
  examCode: "NEET",
  examName: "NEET full mock",
  rawScore: 612,
  maxMarks: 720,
  createdAt: "2026-06-20T10:00:00.000Z",
  ...over,
});

const session = (over: Partial<RawSession> = {}): RawSession => ({
  sessionId: "s1",
  topicId: "t1",
  mode: "PRACTICE",
  status: "SUBMITTED",
  servedCount: 10,
  correctCount: 7,
  startedAt: "2026-06-21T10:00:00.000Z",
  ...over,
});

describe("normalizeMockAttempt", () => {
  it("builds score label, accuracy %, and review href", () => {
    const r = normalizeMockAttempt(mock());
    expect(r.kind).toBe("mock");
    expect(r.title).toBe("NEET full mock");
    expect(r.scoreLabel).toBe("612 / 720");
    expect(r.accuracyPct).toBe(85);
    expect(r.href).toBe("/mock/result?attemptId=m1");
    expect(r.status).toBe("SUBMITTED");
  });

  it("falls back to examCode then generic title", () => {
    expect(normalizeMockAttempt(mock({ examName: null })).title).toBe("NEET");
    expect(
      normalizeMockAttempt(mock({ examName: null, examCode: null })).title,
    ).toBe("Mock test");
  });

  it("guards divide-by-zero on maxMarks", () => {
    expect(normalizeMockAttempt(mock({ maxMarks: 0 })).accuracyPct).toBeNull();
  });
});

describe("normalizePracticeSession", () => {
  it("computes accuracy and result href when submitted", () => {
    const r = normalizePracticeSession(session());
    expect(r.kind).toBe("practice");
    expect(r.accuracyPct).toBe(70);
    expect(r.scoreLabel).toBeNull();
    expect(r.topicId).toBe("t1");
    expect(r.href).toBe("/quiz/s1/result");
  });

  it("routes in-progress sessions to the resume href", () => {
    expect(
      normalizePracticeSession(session({ status: "IN_PROGRESS" })).href,
    ).toBe("/quiz/s1");
  });

  it("returns null accuracy when nothing answered", () => {
    expect(
      normalizePracticeSession(session({ servedCount: 0, correctCount: 0 }))
        .accuracyPct,
    ).toBeNull();
  });
});

describe("relativeTime", () => {
  it('returns "just now" for deltas under 1 minute', () => {
    const iso = new Date(Date.now() - 30 * 1000).toISOString();
    expect(relativeTime(iso)).toBe("just now");
  });

  it('returns "Xm ago" for minute-range deltas', () => {
    const iso = new Date(Date.now() - 5 * 60000).toISOString();
    expect(relativeTime(iso)).toBe("5m ago");
  });

  it('returns "Xh ago" for hour-range deltas', () => {
    const iso = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(relativeTime(iso)).toBe("3h ago");
  });

  it('returns "Xd ago" for day-range deltas (under 7 days)', () => {
    const iso = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(relativeTime(iso)).toBe("2d ago");
  });

  it("does not throw and returns a non-empty string for an unparseable input", () => {
    // new Date("not-a-date") produces NaN in V8 without throwing, so the catch
    // block is not triggered; the function still returns a non-empty string.
    const result = relativeTime("not-a-date");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("mergeRecent", () => {
  it("drops MOCK-mode sessions, sorts newest first, and respects limit", () => {
    const out = mergeRecent(
      [mock({ id: "m1", createdAt: "2026-06-20T10:00:00.000Z" })],
      [
        session({ sessionId: "s1", startedAt: "2026-06-22T10:00:00.000Z" }),
        session({ sessionId: "sMock", mode: "MOCK", startedAt: "2026-06-23T10:00:00.000Z" }),
      ],
      5,
    );
    expect(out.map((r) => r.id)).toEqual(["s1", "m1"]); // sMock dropped, newest first
  });

  it("slices to the limit", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session({ sessionId: `s${i}`, startedAt: `2026-06-${10 + i}T00:00:00.000Z` }),
    );
    expect(mergeRecent([], sessions, 3)).toHaveLength(3);
  });
});
