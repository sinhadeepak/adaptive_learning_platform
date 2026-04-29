// Sprint 24 (P4-S24) — pure-function tests for PYQ frequency helpers.

import { describe, expect, it } from "vitest";

import { totalAcrossYears, trendDirection } from "./pyq_frequency";

describe("trendDirection", () => {
  it("returns up when latest year > prior year", () => {
    expect(trendDirection({ 2022: 2, 2023: 3, 2024: 5 })).toBe("up");
  });

  it("returns down when latest year < prior year", () => {
    expect(trendDirection({ 2022: 6, 2023: 4, 2024: 2 })).toBe("down");
  });

  it("returns flat when latest equals prior", () => {
    expect(trendDirection({ 2022: 3, 2023: 3, 2024: 3 })).toBe("flat");
  });

  it("returns single when only one year is present", () => {
    expect(trendDirection({ 2024: 5 })).toBe("single");
  });

  it("returns flat for an empty counts object", () => {
    expect(trendDirection({})).toBe("flat");
  });
});

describe("totalAcrossYears", () => {
  it("sums all year counts", () => {
    expect(totalAcrossYears({ 2022: 2, 2023: 3, 2024: 5 })).toBe(10);
  });

  it("handles zero counts", () => {
    expect(totalAcrossYears({ 2024: 0 })).toBe(0);
  });
});
