// Sprint 34 (P4-S34) — pure-function tests for reference grouping.

import { describe, expect, it } from "vitest";

import { groupByKind, type TopicReference } from "./references";

const REFS: TopicReference[] = [
  { id: "r1", kind: "video", title: "Newton walkthrough", url: "https://x", position: 0 },
  { id: "r2", kind: "ncert", title: "NCERT Ch 5", url: "https://x", position: 0 },
  { id: "r3", kind: "ncert", title: "NCERT Ch 6", url: "https://x", position: 1 },
  { id: "r4", kind: "textbook", title: "HCV Vol 1", url: "https://x", position: 0 },
];

describe("groupByKind", () => {
  it("orders groups NCERT → Textbook → Derivation → Video → Formula", () => {
    const groups = groupByKind(REFS);
    expect(groups.map((g) => g.kind)).toEqual(["ncert", "textbook", "video"]);
  });

  it("drops empty kind buckets", () => {
    const groups = groupByKind([REFS[0]]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("video");
  });

  it("sorts references within a kind by position", () => {
    const groups = groupByKind(REFS);
    const ncert = groups.find((g) => g.kind === "ncert")!;
    expect(ncert.references.map((r) => r.id)).toEqual(["r2", "r3"]);
  });

  it("renders kind label + icon for each group", () => {
    const groups = groupByKind(REFS);
    expect(groups[0].label).toBe("NCERT");
    expect(groups[0].icon).toBe("📘");
  });
});
