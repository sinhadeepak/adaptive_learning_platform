// Sprint 25 (P4-S25) — pure-function tests for the OMR palette state.

import { describe, expect, it } from "vitest";

import {
  computePaletteState,
  paletteSectionCounts,
  paletteStateFor,
} from "./mock_palette";
import type { MockExamItem } from "./mock_state";

const ITEMS: MockExamItem[] = [
  { itemIdx: 0, questionId: "p1", sectionId: "physics" },
  { itemIdx: 1, questionId: "p2", sectionId: "physics" },
  { itemIdx: 2, questionId: "c1", sectionId: "chemistry" },
  { itemIdx: 3, questionId: "c2", sectionId: "chemistry" },
];

describe("paletteStateFor", () => {
  it("returns unanswered when neither answered nor marked", () => {
    expect(paletteStateFor("q", {}, new Set())).toBe("unanswered");
  });

  it("returns answered when answered but not marked", () => {
    expect(paletteStateFor("q", { q: 0 }, new Set())).toBe("answered");
  });

  it("returns marked when marked but not answered", () => {
    expect(paletteStateFor("q", {}, new Set(["q"]))).toBe("marked");
  });

  it("returns answered_marked when both", () => {
    expect(paletteStateFor("q", { q: 2 }, new Set(["q"]))).toBe("answered_marked");
  });
});

describe("computePaletteState", () => {
  it("emits one cell per item in input order with correct state", () => {
    const answers = { p1: 0, c1: 2 };
    const marked = new Set(["p2", "c1"]);
    const cells = computePaletteState(ITEMS, answers, marked);
    expect(cells.map((c) => c.state)).toEqual([
      "answered",
      "marked",
      "answered_marked",
      "unanswered",
    ]);
  });
});

describe("paletteSectionCounts", () => {
  it("counts answered per section across the cell list", () => {
    const cells = computePaletteState(
      ITEMS,
      { p1: 0, p2: 1 },
      new Set(),
    );
    const counts = paletteSectionCounts(cells);
    expect(counts).toEqual({
      physics: { answered: 2, total: 2 },
      chemistry: { answered: 0, total: 2 },
    });
  });

  it("buckets items with no section under _none", () => {
    const items: MockExamItem[] = [
      { itemIdx: 0, questionId: "x", sectionId: null },
    ];
    const cells = computePaletteState(items, { x: 0 }, new Set());
    const counts = paletteSectionCounts(cells);
    expect(counts._none).toEqual({ answered: 1, total: 1 });
  });
});
