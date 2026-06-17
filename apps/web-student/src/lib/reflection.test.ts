// Tests for reflection + recovery + low-bandwidth clients (P6 S57).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  checkInCommitment,
  listCommitments,
  postReflection,
} from "./reflection";
import {
  acceptRecovery,
  declineRecovery,
  fetchActiveRecovery,
} from "./recovery";
import {
  isLowBandwidthEnabled,
  loadLowBandwidthPrefs,
  saveLowBandwidthPrefs,
} from "./low-bandwidth";

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response("{}", { status: 200 }),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("postReflection", () => {
  test("sends snake_case body + maps the id back", async () => {
    const bodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init?: RequestInit) => {
        if (init?.body) bodies.push(String(init.body));
        return new Response(JSON.stringify({ id: "r-1" }), { status: 201 });
      },
    );
    const out = await postReflection({
      userId: "u-1",
      trigger: "session",
      triggerArtifactId: "sid-1",
      response: "Tripped on units",
      commitment: "Drill formula sheet tomorrow",
      commitmentDueAt: "2026-05-20T00:00:00Z",
    });
    expect(out.id).toBe("r-1");
    const body = JSON.parse(bodies[0]) as Record<string, unknown>;
    expect(body.user_id).toBe("u-1");
    expect(body.trigger).toBe("session");
    expect(body.trigger_artifact_id).toBe("sid-1");
    expect(body.commitment).toBe("Drill formula sheet tomorrow");
    expect(body.commitment_due_at).toBe("2026-05-20T00:00:00Z");
  });

  test("non-2xx throws", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("", { status: 500 }),
    );
    await expect(
      postReflection({ userId: "u-1", trigger: "session" }),
    ).rejects.toThrow(/reflection post failed: HTTP 500/);
  });
});

describe("listCommitments", () => {
  test("maps an array response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify([
          {
            id: "r-1",
            trigger: "session",
            prompt_id: "default_prompt",
            commitment: "Drill Newton",
            commitment_due_at: "2026-05-20T00:00:00Z",
            commitment_status: "pending",
            occurred_at: "2026-05-13T08:00:00Z",
            last_check_in_at: null,
          },
        ]),
        { status: 200 },
      ),
    );
    const out = await listCommitments("u-1", "pending");
    expect(out).toHaveLength(1);
    expect(out[0].commitmentStatus).toBe("pending");
    expect(out[0].commitment).toBe("Drill Newton");
  });

  test("maps an { items } object response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({ items: [] }),
        { status: 200 },
      ),
    );
    const out = await listCommitments("u-1");
    expect(out).toEqual([]);
  });
});

describe("checkInCommitment", () => {
  test("posts body + returns new status", async () => {
    const bodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init?: RequestInit) => {
        if (init?.body) bodies.push(String(init.body));
        return new Response(
          JSON.stringify({ commitment_status: "kept" }),
          { status: 200 },
        );
      },
    );
    const out = await checkInCommitment("r-1", true, "Done at 7am");
    expect(out).toBe("kept");
    const body = JSON.parse(bodies[0]) as Record<string, unknown>;
    expect(body.kept).toBe(true);
    expect(body.note).toBe("Done at 7am");
  });
});

describe("fetchActiveRecovery", () => {
  test("found maps to camelCase", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          proposal: {
            id: "rec-1",
            plan_id: "pl-1",
            triggered_at: "2026-05-14T18:00:00Z",
            missed_session_ids: ["ps-1", "ps-2"],
            catch_up_payload: { kind: "consolidated" },
            rationale: "2 sessions missed this week",
            expected_minutes: 35,
            status: "pending",
          },
        }),
        { status: 200 },
      ),
    );
    const out = await fetchActiveRecovery();
    expect(out.kind).toBe("found");
    if (out.kind === "found") {
      expect(out.proposal.missedSessionIds).toEqual(["ps-1", "ps-2"]);
      expect(out.proposal.expectedMinutes).toBe(35);
    }
  });

  test("absent when proposal is null", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ proposal: null }), { status: 200 }),
    );
    const out = await fetchActiveRecovery();
    expect(out.kind).toBe("absent");
  });

  test("non-2xx throws", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("", { status: 500 }),
    );
    await expect(fetchActiveRecovery()).rejects.toThrow(/HTTP 500/);
  });
});

describe("accept + decline recovery", () => {
  test("accept returns the new status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ status: "accepted" }), { status: 200 }),
    );
    expect(await acceptRecovery("rec-1")).toBe("accepted");
  });
  test("decline returns the new status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ status: "declined" }), { status: 200 }),
    );
    expect(await declineRecovery("rec-1")).toBe("declined");
  });
});

describe("low-bandwidth prefs", () => {
  test("defaults are all false", () => {
    expect(loadLowBandwidthPrefs()).toEqual({
      reducedAnimations: false,
      prefetchOff: false,
      imagesLite: false,
    });
    expect(isLowBandwidthEnabled()).toBe(false);
  });

  test("save + load round-trips", () => {
    saveLowBandwidthPrefs({
      reducedAnimations: true,
      prefetchOff: false,
      imagesLite: true,
    });
    const out = loadLowBandwidthPrefs();
    expect(out.reducedAnimations).toBe(true);
    expect(out.imagesLite).toBe(true);
    expect(isLowBandwidthEnabled()).toBe(true);
  });

  test("corrupted blob falls back to defaults", () => {
    window.localStorage.setItem("ux32.low_bandwidth.v1", "{not-json");
    expect(loadLowBandwidthPrefs()).toEqual({
      reducedAnimations: false,
      prefetchOff: false,
      imagesLite: false,
    });
  });
});
