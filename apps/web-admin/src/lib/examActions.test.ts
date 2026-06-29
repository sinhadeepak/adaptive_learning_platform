import { describe, expect, it } from "vitest";
import { isDeletable } from "./examActions";

describe("isDeletable", () => {
  it("is true when both counts are zero", () => {
    expect(isDeletable({ question_count: 0, blueprint_count: 0 })).toBe(true);
  });
  it("is false when questions exist", () => {
    expect(isDeletable({ question_count: 3, blueprint_count: 0 })).toBe(false);
  });
  it("is false when blueprints exist", () => {
    expect(isDeletable({ question_count: 0, blueprint_count: 2 })).toBe(false);
  });
  it("is false when both exist", () => {
    expect(isDeletable({ question_count: 5, blueprint_count: 1 })).toBe(false);
  });
});
