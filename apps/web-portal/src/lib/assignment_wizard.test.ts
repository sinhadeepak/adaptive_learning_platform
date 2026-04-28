// Sprint 10 S10-B — Assignment Authoring wizard step machine tests.

import { describe, expect, test } from "vitest";

import {
  type WizardState,
  dueAtToIso,
  initialWizardState,
  nextStep,
  prevStep,
  toggleQuestion,
  validateStep,
} from "./assignment_wizard";

function _s(over: Partial<WizardState> = {}): WizardState {
  return { ...initialWizardState, ...over };
}

describe("validateStep", () => {
  test("step 1 needs a cohort", () => {
    expect(validateStep(_s({ step: 1 }))).toHaveLength(1);
    expect(validateStep(_s({ step: 1, cohortId: "c-1" }))).toHaveLength(0);
  });

  test("step 2 needs at least one question", () => {
    expect(validateStep(_s({ step: 2 }))).toHaveLength(1);
    expect(
      validateStep(_s({ step: 2, questionIds: ["q-1"] })),
    ).toHaveLength(0);
  });

  test("step 2 caps at 100 questions", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `q-${i}`);
    expect(validateStep(_s({ step: 2, questionIds: ids }))).toHaveLength(1);
  });

  test("step 3 needs a title >= 2 chars", () => {
    expect(
      validateStep(_s({ step: 3, title: "" })).map((e) => e.field),
    ).toContain("title");
    expect(
      validateStep(_s({ step: 3, title: "x" })).map((e) => e.field),
    ).toContain("title");
    expect(
      validateStep(_s({ step: 3, title: "ok" })).map((e) => e.field),
    ).not.toContain("title");
  });

  test("step 3 rejects garbage due dates", () => {
    expect(
      validateStep(_s({ step: 3, title: "ok", dueAt: "not-a-date" })).map(
        (e) => e.field,
      ),
    ).toContain("dueAt");
  });

  test("step 3 accepts empty due date (optional)", () => {
    expect(validateStep(_s({ step: 3, title: "ok", dueAt: "" }))).toHaveLength(0);
  });
});

describe("nextStep / prevStep", () => {
  test("nextStep no-ops when validation fails", () => {
    const s = _s({ step: 1 });
    expect(nextStep(s)).toEqual(s);
  });

  test("nextStep advances when valid", () => {
    const s = _s({ step: 1, cohortId: "c-1" });
    expect(nextStep(s).step).toBe(2);
  });

  test("nextStep stops at step 3", () => {
    const s = _s({ step: 3, title: "ok", questionIds: ["q-1"] });
    // step 2 validation never runs at step 3, but nextStep is a hard cap anyway
    expect(nextStep(s).step).toBe(3);
  });

  test("prevStep moves back, never below 1", () => {
    expect(prevStep(_s({ step: 2 })).step).toBe(1);
    expect(prevStep(_s({ step: 1 })).step).toBe(1);
  });
});

describe("toggleQuestion", () => {
  test("adds when missing", () => {
    expect(toggleQuestion(_s(), "q-1").questionIds).toEqual(["q-1"]);
  });

  test("removes when present", () => {
    const s = _s({ questionIds: ["q-1", "q-2"] });
    expect(toggleQuestion(s, "q-1").questionIds).toEqual(["q-2"]);
  });
});

describe("dueAtToIso", () => {
  test("empty input → null", () => {
    expect(dueAtToIso("")).toBeNull();
  });

  test("YYYY-MM-DD → end-of-day ISO", () => {
    const got = dueAtToIso("2026-05-15");
    expect(got).toBeTruthy();
    expect(got).toMatch(/2026-05-1[45]T/); // depends on host TZ; either is OK
    expect(got).toMatch(/Z$/);
  });

  test("malformed → null", () => {
    expect(dueAtToIso("nope")).toBeNull();
  });
});
