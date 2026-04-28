import { describe, expect, it } from "vitest";

import { nextPosition } from "./course_structure";

describe("nextPosition", () => {
  it("returns 1 when the list is empty", () => {
    expect(nextPosition([])).toBe(1);
  });

  it("returns max + 1 even when items are out of order", () => {
    expect(nextPosition([{ position: 3 }, { position: 1 }, { position: 2 }])).toBe(4);
  });
});
