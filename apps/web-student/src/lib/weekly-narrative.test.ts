// Unit tests for the weekly-narrative client + helpers (Phase 6 S53).

import { describe, expect, test } from "vitest";

import {
  _camelizeRecordForTest,
  formatWeekRange,
  parseDataLink,
} from "./weekly-narrative";

describe("camelizeRecord (wire → typed)", () => {
  test("maps every snake_case field", () => {
    const raw = {
      id: "n-1",
      user_id: "u-1",
      week_start: "2026-05-11",
      narrative: {
        improved: { text: "x", data_link: "concept_mastery_delta:a:1→2" },
        slipping: { text: "y" },
        hidden_pattern: { text: "z" },
        forecast: { text: "w" },
        week_ahead: { text: "ahead", actions: ["a", "b"] },
      },
      source: "ai" as const,
      model: "gpt-4o-mini",
      prompt_template_id: "weekly_narrative",
      prompt_template_version: "1.0.0",
      is_delta: false,
      delta_trigger: null,
    };
    const out = _camelizeRecordForTest(raw);
    expect(out.id).toBe("n-1");
    expect(out.userId).toBe("u-1");
    expect(out.weekStart).toBe("2026-05-11");
    expect(out.source).toBe("ai");
    expect(out.promptTemplateVersion).toBe("1.0.0");
    expect(out.isDelta).toBe(false);
    expect(out.narrative.improved.data_link).toBe(
      "concept_mastery_delta:a:1→2",
    );
    expect(out.narrative.week_ahead.actions).toEqual(["a", "b"]);
  });

  test("coalesces null model + delta_trigger", () => {
    const raw = {
      id: "n-2",
      user_id: "u-2",
      week_start: "2026-05-04",
      narrative: {
        improved: { text: "" },
        slipping: { text: "" },
        hidden_pattern: { text: "" },
        forecast: { text: "" },
        week_ahead: { text: "", actions: ["x"] },
      },
      source: "heuristic" as const,
      model: null,
      prompt_template_id: "weekly_narrative",
      prompt_template_version: "1.0.0",
      is_delta: false,
      delta_trigger: null,
    };
    const out = _camelizeRecordForTest(raw);
    expect(out.model).toBeNull();
    expect(out.deltaTrigger).toBeNull();
  });
});

describe("parseDataLink", () => {
  test("returns null for empty / undefined", () => {
    expect(parseDataLink(undefined)).toBeNull();
    expect(parseDataLink("")).toBeNull();
    expect(parseDataLink("   ")).toBeNull();
  });

  test("routes concept_mastery_delta to /concept-profile", () => {
    const p = parseDataLink("concept_mastery_delta:newton-3:0.58→0.71");
    expect(p).not.toBeNull();
    expect(p!.source).toBe("concept_mastery_delta");
    expect(p!.key).toBe("newton-3");
    expect(p!.value).toBe("0.58→0.71");
    expect(p!.href).toBe("/concept-profile");
    expect(p!.label).toBe("See concept profile");
  });

  test("routes topic_decay to /syllabus", () => {
    const p = parseDataLink("topic_decay:thermodynamics-2:14d");
    expect(p!.href).toBe("/syllabus");
  });

  test("routes error_pattern to /diagnostic-deep-dive", () => {
    const p = parseDataLink("error_pattern:silly_mistake:n=12");
    expect(p!.href).toBe("/diagnostic-deep-dive");
  });

  test("unknown source falls back to /insights", () => {
    const p = parseDataLink("brand_new_signal:foo:bar");
    expect(p!.source).toBe("brand_new_signal");
    expect(p!.href).toBe("/insights");
    expect(p!.label).toBe("Open insights");
  });

  test("citation without value (source:key only)", () => {
    const p = parseDataLink("readiness:on_track");
    expect(p!.source).toBe("readiness");
    expect(p!.key).toBe("on_track");
    expect(p!.value).toBeUndefined();
  });

  test("composite value with embedded colons stays intact", () => {
    const p = parseDataLink("time_distribution:morning:14:00-09:00");
    expect(p!.value).toBe("14:00-09:00");
  });
});

describe("formatWeekRange", () => {
  test("renders Mon→Sun range", () => {
    // Monday 2026-05-11 — span ends Sunday 2026-05-17.
    const out = formatWeekRange("2026-05-11");
    // The exact locale string varies; assert structural shape only.
    expect(out).toMatch(/May 11/);
    expect(out).toMatch(/May 17/);
    expect(out).toContain("–");
  });

  test("invalid date passes through", () => {
    expect(formatWeekRange("not-a-date")).toBe("not-a-date");
  });
});
