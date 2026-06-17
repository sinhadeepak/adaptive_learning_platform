// Sprint 23 (P4-S23) — pure-function tests for mock-exam helpers.

import { describe, expect, it } from "vitest";

import {
  canNavigate,
  computeSectionTotals,
  firstIdxOfSection,
  markedReviewQueue,
  type MockExamItem,
  type MockExamSection,
} from "./mock_state";

const sections: MockExamSection[] = [
  { sectionId: "physics", name: "Physics", nRequested: 2, nComposed: 2, short: false },
  { sectionId: "chemistry", name: "Chemistry", nRequested: 2, nComposed: 2, short: false },
];

const items: MockExamItem[] = [
  { itemIdx: 0, questionId: "p1", sectionId: "physics" },
  { itemIdx: 1, questionId: "p2", sectionId: "physics" },
  { itemIdx: 2, questionId: "c1", sectionId: "chemistry" },
  { itemIdx: 3, questionId: "c2", sectionId: "chemistry" },
];

describe("computeSectionTotals", () => {
  it("counts answered + marked + unanswered per section", () => {
    const answers = { p1: 0, c1: 2 };
    const marked = new Set(["p2"]);
    const totals = computeSectionTotals(items, sections, answers, marked);
    expect(totals).toEqual([
      { sectionId: "physics", name: "Physics", served: 2, answered: 1, marked: 1, unanswered: 1 },
      { sectionId: "chemistry", name: "Chemistry", served: 2, answered: 1, marked: 0, unanswered: 1 },
    ]);
  });

  it("ignores items with null section_id", () => {
    const stray: MockExamItem[] = [
      ...items,
      { itemIdx: 4, questionId: "q-orphan", sectionId: null },
    ];
    const totals = computeSectionTotals(stray, sections, {}, new Set());
    expect(totals.reduce((acc, t) => acc + t.served, 0)).toBe(4); // orphan skipped
  });
});

describe("firstIdxOfSection", () => {
  it("returns the first index of a section", () => {
    expect(firstIdxOfSection(items, "physics")).toBe(0);
    expect(firstIdxOfSection(items, "chemistry")).toBe(2);
    expect(firstIdxOfSection(items, "biology")).toBe(-1);
  });
});

describe("markedReviewQueue", () => {
  it("returns items whose questionId is in the marked set", () => {
    const marked = new Set(["p1", "c2"]);
    const q = markedReviewQueue(items, marked);
    expect(q.map((i) => i.questionId)).toEqual(["p1", "c2"]);
  });
});

describe("canNavigate", () => {
  it("allows any in-bounds jump when inter-section nav is on", () => {
    expect(canNavigate(items, 0, 3, true)).toBe(true);
    expect(canNavigate(items, 3, 0, true)).toBe(true);
  });

  it("blocks cross-section jumps when sections are locked", () => {
    expect(canNavigate(items, 0, 1, false)).toBe(true); // same section
    expect(canNavigate(items, 0, 2, false)).toBe(false); // diff section
    expect(canNavigate(items, 2, 3, false)).toBe(true); // same section
  });

  it("rejects out-of-bounds jumps", () => {
    expect(canNavigate(items, 0, -1, true)).toBe(false);
    expect(canNavigate(items, 0, 4, true)).toBe(false);
  });
});
