// Sprint 33 (P4-S33) — pure-function tests for Goals.tsx helpers.

import { describe, expect, it } from "vitest";

import { trajectoryColour, weeklyActionsCopy, type WeeklyActions } from "./goals";

describe("trajectoryColour", () => {
  it("maps each status to a token-bearing var()", () => {
    expect(trajectoryColour("on_track")).toContain("color-blue");
    expect(trajectoryColour("ahead")).toContain("color-green");
    expect(trajectoryColour("behind")).toContain("color-amber");
    expect(trajectoryColour("no_target")).toContain("text-muted");
  });
});

describe("weeklyActionsCopy", () => {
  it("returns the no-target prompt when priority is no_target", () => {
    const actions: WeeklyActions = {
      priority: "no_target",
      weeklyMockTarget: 0,
      weeklyMinutesTarget: 0,
      dailyTopicsTarget: 0,
    };
    expect(weeklyActionsCopy(actions)).toEqual([
      "Set a target rank to see your weekly plan.",
    ]);
  });

  it("returns 3 actions when targets are set", () => {
    const actions: WeeklyActions = {
      priority: "drill",
      weeklyMockTarget: 2,
      weeklyMinutesTarget: 12 * 60,
      dailyTopicsTarget: 3,
    };
    const copy = weeklyActionsCopy(actions);
    expect(copy).toHaveLength(3);
    expect(copy[0]).toContain("2 full-length mocks");
    expect(copy[1]).toMatch(/\d+ minutes\/day/);
    expect(copy[2]).toContain("3 weak topics per day");
  });

  it("uses singular forms for count of 1", () => {
    const actions: WeeklyActions = {
      priority: "peaking",
      weeklyMockTarget: 1,
      weeklyMinutesTarget: 30 * 60,
      dailyTopicsTarget: 1,
    };
    const copy = weeklyActionsCopy(actions);
    expect(copy[0]).toContain("1 full-length mock ");
    expect(copy[2]).toContain("1 weak topic per day");
  });
});
