// Sprint 9 F-1 — assignment copy helper tests.
//
// Two functions, two contracts:
//  - progressBucket() drives which pill colour the row shows
//  - formatDueAt() drives the human-readable due-date copy

import { describe, expect, test } from "vitest";

import {
  formatDueAt,
  progressBucket,
  type Assignment,
} from "./assignments";

function _a(over: Partial<Assignment> = {}): Assignment {
  return {
    id: "a-1",
    cohortId: "c-1",
    tenantId: null,
    title: "Test",
    description: null,
    createdBy: "t-1",
    dueAt: null,
    publishedAt: "2026-04-28T00:00:00Z",
    createdAt: "2026-04-28T00:00:00Z",
    updatedAt: "2026-04-28T00:00:00Z",
    myCompletedAt: null,
    myCorrectCount: null,
    myTotalCount: null,
    ...over,
  };
}

describe("progressBucket", () => {
  test("completed bucket when student has completed timestamp", () => {
    const a = _a({
      myCompletedAt: "2026-04-29T10:00:00Z",
      dueAt: "2026-04-30T00:00:00Z",
    });
    expect(progressBucket(a, new Date("2026-05-15T00:00:00Z"))).toBe("completed");
  });

  test("overdue when due in past and not completed", () => {
    const a = _a({ dueAt: "2026-04-15T00:00:00Z" });
    expect(progressBucket(a, new Date("2026-04-28T00:00:00Z"))).toBe("overdue");
  });

  test("due-soon when within 24h and not completed", () => {
    const a = _a({ dueAt: "2026-04-29T05:00:00Z" });
    expect(progressBucket(a, new Date("2026-04-28T18:00:00Z"))).toBe("due-soon");
  });

  test("open when due > 24h away", () => {
    const a = _a({ dueAt: "2026-05-10T00:00:00Z" });
    expect(progressBucket(a, new Date("2026-04-28T00:00:00Z"))).toBe("open");
  });

  test("open when no due date", () => {
    const a = _a({ dueAt: null });
    expect(progressBucket(a, new Date("2026-04-28T00:00:00Z"))).toBe("open");
  });

  test("completed wins over overdue (completed late)", () => {
    const a = _a({
      dueAt: "2026-04-15T00:00:00Z",
      myCompletedAt: "2026-04-20T00:00:00Z",
    });
    expect(progressBucket(a, new Date("2026-04-28T00:00:00Z"))).toBe("completed");
  });
});

describe("formatDueAt", () => {
  test("empty string when no due date", () => {
    expect(formatDueAt(_a({ dueAt: null }))).toBe("");
  });

  test("'Due today' when due within 24h", () => {
    const a = _a({ dueAt: "2026-04-28T22:00:00Z" });
    expect(formatDueAt(a, new Date("2026-04-28T08:00:00Z"))).toBe("Due today");
  });

  test("'Due tomorrow' when due 24-48h away", () => {
    const a = _a({ dueAt: "2026-04-29T22:00:00Z" });
    expect(formatDueAt(a, new Date("2026-04-28T08:00:00Z"))).toBe("Due tomorrow");
  });

  test("'Due in Nd' for further-future due", () => {
    const a = _a({ dueAt: "2026-05-05T00:00:00Z" });
    expect(formatDueAt(a, new Date("2026-04-28T00:00:00Z"))).toBe("Due in 7d");
  });

  test("'Overdue (yesterday)' when 1 day past", () => {
    const a = _a({ dueAt: "2026-04-27T08:00:00Z" });
    expect(formatDueAt(a, new Date("2026-04-28T08:00:00Z"))).toBe(
      "Overdue (yesterday)",
    );
  });

  test("'Overdue (Nd ago)' when more than 1 day past", () => {
    const a = _a({ dueAt: "2026-04-20T00:00:00Z" });
    expect(formatDueAt(a, new Date("2026-04-28T00:00:00Z"))).toBe(
      "Overdue (8d ago)",
    );
  });

  test("'Due <date>' once student has completed (no urgency framing)", () => {
    const a = _a({
      dueAt: "2026-04-25T00:00:00Z",
      myCompletedAt: "2026-04-26T10:00:00Z",
    });
    const got = formatDueAt(a, new Date("2026-04-28T00:00:00Z"));
    expect(got).toMatch(/^Due /);
    expect(got).not.toContain("Overdue");
  });
});
