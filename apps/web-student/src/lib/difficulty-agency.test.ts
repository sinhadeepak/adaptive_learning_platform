// Tests for the difficulty-agency client + helpers (Phase 6 S54).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  checkFriction,
  frictionReasonLabel,
  hasSeenAdaptsExplainer,
  INTENT_LABELS,
  loadIntentForTopic,
  markAdaptsExplainerSeen,
  previewIntentOffset,
  saveIntentForTopic,
} from "./difficulty-agency";

beforeEach(() => {
  // jsdom localStorage starts fresh between tests; reset just in case.
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("INTENT_LABELS", () => {
  test("labels every intent anchor", () => {
    expect(INTENT_LABELS.match).toBe("Match my level");
    expect(INTENT_LABELS.push).toBe("Push me");
    expect(INTENT_LABELS.build_confidence).toBe("Build confidence");
  });
});

describe("checkFriction", () => {
  test("maps the snake_case trigger response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResp({
        trigger: {
          reason: "repeated_wrong",
          suggested_offset: -0.2,
          suggested_action: "easier",
          message: "The last 3 felt rough.",
        },
      }),
    );
    const trigger = await checkFriction(
      [
        { itemIdx: 0, isCorrect: false, timeSpentMs: 5000 },
        { itemIdx: 1, isCorrect: false, timeSpentMs: 8000 },
        { itemIdx: 2, isCorrect: false, timeSpentMs: 6000 },
      ],
      null,
    );
    expect(trigger).not.toBeNull();
    expect(trigger!.reason).toBe("repeated_wrong");
    expect(trigger!.suggestedOffset).toBe(-0.2);
    expect(trigger!.suggestedAction).toBe("easier");
  });

  test("returns null when no trigger fires", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResp({ trigger: null }),
    );
    const trigger = await checkFriction(
      [{ itemIdx: 0, isCorrect: true, timeSpentMs: 12000 }],
      null,
    );
    expect(trigger).toBeNull();
  });

  test("non-2xx response throws", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("boom", { status: 500 }),
    );
    await expect(checkFriction([], null)).rejects.toThrow(
      /friction check failed: HTTP 500/,
    );
  });

  test("sends snake_case history payload", async () => {
    const sentBodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) sentBodies.push(String(init.body));
        return jsonResp({ trigger: null });
      },
    );
    await checkFriction(
      [
        { itemIdx: 4, isCorrect: true, timeSpentMs: 3000 },
        { itemIdx: 5, skipped: true },
      ],
      3,
    );
    const body = JSON.parse(sentBodies[0]) as {
      history: { item_idx: number; is_correct: boolean | null; time_spent_ms: number | null; skipped: boolean }[];
      last_friction_at_idx: number | null;
    };
    expect(body.history[0].item_idx).toBe(4);
    expect(body.history[0].is_correct).toBe(true);
    expect(body.history[0].time_spent_ms).toBe(3000);
    expect(body.history[1].skipped).toBe(true);
    expect(body.last_friction_at_idx).toBe(3);
  });
});

describe("previewIntentOffset", () => {
  test("maps the response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResp({
        intent_anchor: "push",
        offset: 0.4,
        effective_theta: 0.7,
      }),
    );
    const out = await previewIntentOffset("push", 0.3);
    expect(out.intentAnchor).toBe("push");
    expect(out.offset).toBe(0.4);
    expect(out.effectiveTheta).toBe(0.7);
  });

  test("non-2xx throws", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("nope", { status: 422 }),
    );
    await expect(previewIntentOffset("match")).rejects.toThrow(
      /intent offset failed: HTTP 422/,
    );
  });
});

describe("localStorage helpers", () => {
  test("loadIntentForTopic returns null when missing", () => {
    expect(loadIntentForTopic("t-1")).toBeNull();
  });

  test("save + load round-trips a valid intent", () => {
    saveIntentForTopic("t-1", "push");
    expect(loadIntentForTopic("t-1")).toBe("push");
    saveIntentForTopic("t-1", "build_confidence");
    expect(loadIntentForTopic("t-1")).toBe("build_confidence");
  });

  test("ignores corrupted values", () => {
    window.localStorage.setItem("quiz.intent.v1.t-x", "garbage");
    expect(loadIntentForTopic("t-x")).toBeNull();
  });

  test("hasSeenAdaptsExplainer flips after markSeen", () => {
    expect(hasSeenAdaptsExplainer()).toBe(false);
    markAdaptsExplainerSeen();
    expect(hasSeenAdaptsExplainer()).toBe(true);
  });
});

describe("frictionReasonLabel", () => {
  test("maps every reason", () => {
    expect(frictionReasonLabel("repeated_wrong")).toBe("Three wrong in a row");
    expect(frictionReasonLabel("fast_correct")).toBe("Cruising through");
    expect(frictionReasonLabel("long_hesitation")).toBe("Long hesitation");
    expect(frictionReasonLabel("repeated_skip")).toBe("Two skips in a row");
  });
});

function jsonResp(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
