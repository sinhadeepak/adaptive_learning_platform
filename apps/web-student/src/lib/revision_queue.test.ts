// Sprint 27 (P4-S27) — pure-function tests for the revision-queue helpers.

import { describe, expect, it } from "vitest";

import {
  formatInterval,
  masteryBucket,
  summariseRevisionList,
  type MasteryLookupRow,
  type RevisionItem,
} from "./revision_queue";

describe("masteryBucket", () => {
  it("returns NOT_STARTED for missing or zero EWA", () => {
    expect(masteryBucket(undefined)).toBe("NOT_STARTED");
    expect(masteryBucket(0)).toBe("NOT_STARTED");
  });

  it("returns WEAK for EWA in (0, 0.4)", () => {
    expect(masteryBucket(0.2)).toBe("WEAK");
  });

  it("returns DEVELOPING for EWA in [0.4, 0.7)", () => {
    expect(masteryBucket(0.4)).toBe("DEVELOPING");
    expect(masteryBucket(0.69)).toBe("DEVELOPING");
  });

  it("returns STRONG for EWA in [0.7, 1]", () => {
    expect(masteryBucket(0.7)).toBe("STRONG");
    expect(masteryBucket(1)).toBe("STRONG");
  });
});

describe("formatInterval", () => {
  it("renders day-band labels", () => {
    expect(formatInterval(0)).toBe("Today");
    expect(formatInterval(1)).toBe("1 day");
    expect(formatInterval(3)).toBe("3 days");
    expect(formatInterval(7)).toBe("1 week");
    expect(formatInterval(14)).toBe("2 weeks");
    expect(formatInterval(30)).toBe("1 month");
    expect(formatInterval(90)).toBe("3 months");
  });
});

describe("summariseRevisionList", () => {
  const ITEM: RevisionItem = {
    topicId: "t-mech",
    topicTitle: "Mechanics",
    lastAttemptAt: "2026-04-01T10:00:00Z",
    dueAt: "2026-04-08T10:00:00Z",
    intervalDays: 7,
    easeFactor: 2.5,
    attempts: 3,
    overdueDays: 0,
  };

  it("joins each item with the corresponding mastery bucket", () => {
    const mastery: MasteryLookupRow[] = [{ topicId: "t-mech", ewa: 0.55, n: 5 }];
    const out = summariseRevisionList([ITEM], mastery);
    expect(out[0].bucket).toBe("DEVELOPING");
    expect(out[0].intervalLabel).toBe("1 week");
  });

  it("falls back to NOT_STARTED when mastery is missing", () => {
    const out = summariseRevisionList([ITEM], []);
    expect(out[0].bucket).toBe("NOT_STARTED");
  });
});
