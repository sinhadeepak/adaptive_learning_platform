// Tests for the readiness + topic-decay client (Phase 6 S56).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  decayArrow,
  decayArrowTone,
  fetchReadinessBand,
  fetchTopicDecay,
} from "./readiness";

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response("{}", { status: 200 }),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("fetchTopicDecay", () => {
  test("maps the items array to camelCase", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          user_id: "u-1",
          items: [
            {
              concept_id: "c-aaa",
              ewa: 0.81,
              n: 5,
              decay_days: 2,
              decay_severity: "fresh",
            },
            {
              concept_id: "c-bbb",
              ewa: 0.32,
              n: 3,
              decay_days: 18,
              decay_severity: "critical",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const out = await fetchTopicDecay("u-1");
    expect(out).toHaveLength(2);
    expect(out[0].conceptId).toBe("c-aaa");
    expect(out[0].decaySeverity).toBe("fresh");
    expect(out[1].decayDays).toBe(18);
  });

  test("missing items array coalesces to empty", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ user_id: "u-1" }), { status: 200 }),
    );
    const out = await fetchTopicDecay("u-1");
    expect(out).toEqual([]);
  });

  test("non-2xx throws", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("", { status: 500 }),
    );
    await expect(fetchTopicDecay("u-1")).rejects.toThrow(
      /topic decay fetch failed: HTTP 500/,
    );
  });
});

describe("fetchReadinessBand", () => {
  test("maps the response + sends query string", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          user_id: "u-1",
          readiness_score: 0.58,
          target_score: 0.7,
          days_to_exam: 90,
          band: "behind",
          actions: ["Add 15m daily", "Run mock test on Sunday"],
        }),
        { status: 200 },
      );
    });
    const out = await fetchReadinessBand("u-1", {
      targetScore: 0.7,
      daysToExam: 90,
    });
    expect(out.band).toBe("behind");
    expect(out.readinessScore).toBe(0.58);
    expect(out.actions).toHaveLength(2);
    expect(calls[0]).toContain("target_score=0.7");
    expect(calls[0]).toContain("days_to_exam=90");
  });

  test("omits the query string when no opts passed", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          user_id: "u-1",
          readiness_score: 0.5,
          target_score: 0.7,
          days_to_exam: 90,
          band: "on_track",
          actions: [],
        }),
        { status: 200 },
      );
    });
    await fetchReadinessBand("u-1");
    expect(calls[0]).not.toContain("?");
  });

  test("non-2xx throws", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("", { status: 503 }),
    );
    await expect(fetchReadinessBand("u-1")).rejects.toThrow(
      /readiness band fetch failed: HTTP 503/,
    );
  });
});

describe("decay helpers", () => {
  test("decayArrow maps each severity", () => {
    expect(decayArrow("fresh")).toBe("↑");
    expect(decayArrow("aging")).toBe("—");
    expect(decayArrow("stale")).toBe("↓");
    expect(decayArrow("critical")).toBe("↓");
  });
  test("decayArrowTone maps each severity", () => {
    expect(decayArrowTone("fresh")).toBe("success");
    expect(decayArrowTone("aging")).toBe("neutral");
    expect(decayArrowTone("stale")).toBe("warning");
    expect(decayArrowTone("critical")).toBe("danger");
  });
});
