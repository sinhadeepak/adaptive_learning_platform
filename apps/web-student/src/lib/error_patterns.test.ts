import { describe, expect, it } from "vitest";

import {
  summarisePatterns,
  tagColour,
  tagLabel,
  type PatternRollup,
} from "./error_patterns";

describe("tagLabel", () => {
  it("maps every tag to a human label", () => {
    expect(tagLabel("silly_mistake")).toBe("Silly mistakes");
    expect(tagLabel("conceptual_gap")).toBe("Conceptual gaps");
    expect(tagLabel("time_pressure")).toBe("Time-pressure errors");
    expect(tagLabel("formula_error")).toBe("Formula misapplication");
    expect(tagLabel("sign_or_unit_error")).toBe("Sign / unit errors");
    expect(tagLabel("unattempted")).toBe("Unattempted");
  });
});

describe("tagColour", () => {
  it("returns a token colour for each tag", () => {
    expect(tagColour("conceptual_gap")).toContain("color-red");
    expect(tagColour("silly_mistake")).toContain("color-amber");
    expect(tagColour("time_pressure")).toContain("color-blue");
  });
});

describe("summarisePatterns", () => {
  it("returns empty array on null", () => {
    expect(summarisePatterns(null)).toEqual([]);
  });

  it("filters zero-count rows + sorts by count desc", () => {
    const rollup: PatternRollup = {
      userId: "u",
      since: null,
      totals: { silly_mistake: 3, conceptual_gap: 7 },
      topPatterns: [
        { classification: "silly_mistake", count: 3, topTopics: [] },
        { classification: "conceptual_gap", count: 7, topTopics: [] },
        { classification: "formula_error", count: 0, topTopics: [] },
      ],
    };
    const out = summarisePatterns(rollup);
    expect(out.map((p) => p.classification)).toEqual([
      "conceptual_gap",
      "silly_mistake",
    ]);
  });
});
