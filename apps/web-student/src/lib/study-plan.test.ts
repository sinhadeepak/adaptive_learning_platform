// Tests for the study-plan client (Phase 6 S55).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  _camelizePlanForTest,
  dayOffsetLabel,
  editPlan,
  fetchActivePlan,
  generatePlan,
  sessionKindLabel,
} from "./study-plan";

const PLAN_FIXTURE = {
  id: "pl-1",
  user_id: "u-1",
  week_start: "2026-05-11",
  target_date: "2026-08-01",
  daily_minutes_goal: 45,
  source: "ai_initial",
  status: "active",
  sessions: [
    {
      id: "ps-1",
      plan_id: "pl-1",
      day_offset: 0,
      slot: "evening",
      kind: "practice_concept",
      concept_id: "c-aaa",
      topic_id: null,
      expected_minutes: 25,
      expected_questions: 10,
      is_required: true,
      locked_reason: null,
      status: "pending",
      completed_at: null,
      linked_session_id: null,
      position: 0,
    },
    {
      id: "ps-2",
      plan_id: "pl-1",
      day_offset: 0,
      slot: "evening",
      kind: "revise_concept",
      concept_id: null,
      topic_id: "t-bbb",
      expected_minutes: 15,
      expected_questions: 5,
      is_required: false,
      locked_reason: null,
      status: "pending",
      completed_at: null,
      linked_session_id: null,
      position: 1,
    },
  ],
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify(PLAN_FIXTURE), { status: 200 }),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("camelizePlan", () => {
  test("maps the wire shape", () => {
    const out = _camelizePlanForTest(PLAN_FIXTURE);
    expect(out.id).toBe("pl-1");
    expect(out.weekStart).toBe("2026-05-11");
    expect(out.targetDate).toBe("2026-08-01");
    expect(out.dailyMinutesGoal).toBe(45);
    expect(out.sessions).toHaveLength(2);
    expect(out.sessions[0].kind).toBe("practice_concept");
    expect(out.sessions[0].isRequired).toBe(true);
    expect(out.sessions[1].expectedMinutes).toBe(15);
  });

  test("coalesces missing sessions array", () => {
    const out = _camelizePlanForTest({ ...PLAN_FIXTURE, sessions: undefined as never });
    expect(out.sessions).toEqual([]);
  });
});

describe("fetchActivePlan", () => {
  test("returns kind=found on 200", async () => {
    const res = await fetchActivePlan();
    expect(res.kind).toBe("found");
    if (res.kind === "found") {
      expect(res.plan.id).toBe("pl-1");
    }
  });

  test("returns kind=absent on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("", { status: 404 }),
    );
    const res = await fetchActivePlan();
    expect(res.kind).toBe("absent");
  });

  test("throws on non-200, non-404", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("", { status: 500 }),
    );
    await expect(fetchActivePlan()).rejects.toThrow(
      /active plan fetch failed: HTTP 500/,
    );
  });
});

describe("generatePlan", () => {
  test("posts snake_case defaults", async () => {
    const bodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init?: RequestInit) => {
        if (init?.body) bodies.push(String(init.body));
        return new Response(JSON.stringify(PLAN_FIXTURE), { status: 200 });
      },
    );
    await generatePlan({ dailyMinutesGoal: 60 });
    const body = JSON.parse(bodies[0]) as Record<string, unknown>;
    expect(body.daily_minutes_goal).toBe(60);
    expect(body.target_date).toBeNull();
    expect(body.weak_concepts).toEqual([]);
    expect(body.has_recent_mock).toBe(false);
  });
});

describe("editPlan", () => {
  test("posts the edit payload + maps response", async () => {
    const bodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init?: RequestInit) => {
        if (init?.body) bodies.push(String(init.body));
        return new Response(
          JSON.stringify({
            edit_id: "e-1",
            impact_preview: { summary: "Moved to tomorrow." },
            blocked: false,
            block_reason: null,
          }),
          { status: 200 },
        );
      },
    );
    const res = await editPlan("pl-1", {
      kind: "postpone",
      sessionId: "ps-1",
      toDayOffset: 1,
    });
    expect(res.editId).toBe("e-1");
    expect(res.blocked).toBe(false);
    expect(res.impactPreview.summary).toBe("Moved to tomorrow.");
    const body = JSON.parse(bodies[0]) as Record<string, unknown>;
    expect(body.kind).toBe("postpone");
    expect(body.session_id).toBe("ps-1");
    expect(body.to_day_offset).toBe(1);
  });

  test("propagates blocked=true with reason", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          edit_id: "e-2",
          impact_preview: {},
          blocked: true,
          block_reason: "required sessions stay put",
        }),
        { status: 200 },
      ),
    );
    const res = await editPlan("pl-1", { kind: "rest", sessionId: "ps-1" });
    expect(res.blocked).toBe(true);
    expect(res.blockReason).toBe("required sessions stay put");
  });
});

describe("display helpers", () => {
  test("sessionKindLabel maps known kinds", () => {
    expect(sessionKindLabel("practice_concept")).toBe("Practice — weak concept");
    expect(sessionKindLabel("revise_concept")).toBe("Revise — fading recall");
    expect(sessionKindLabel("take_mock")).toBe("Mock — full pattern");
  });

  test("sessionKindLabel passes through unknown kinds", () => {
    expect(sessionKindLabel("custom_kind")).toBe("custom_kind");
  });

  test("dayOffsetLabel renders weekday + date", () => {
    const out = dayOffsetLabel(2, "2026-05-11");
    expect(out).toMatch(/May 13/);
    expect(out).toContain("·");
  });

  test("dayOffsetLabel falls back on invalid week start", () => {
    expect(dayOffsetLabel(0, "not-a-date")).toBe("Day 1");
  });
});
