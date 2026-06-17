// Sprint 32 (P4-S32) — pure-function tests for peer-percentile pill state.

import { describe, expect, it } from "vitest";

import { bandFor, pillState, type PeerPercentileResp } from "./peer_percentile";

describe("bandFor", () => {
  it("classifies top / high / mid / low", () => {
    expect(bandFor(95)).toBe("top");
    expect(bandFor(75)).toBe("high");
    expect(bandFor(50)).toBe("mid");
    expect(bandFor(15)).toBe("low");
  });
});

describe("pillState", () => {
  it("hides when response is null", () => {
    expect(pillState(null)).toEqual({ visible: false });
  });

  it("hides with reason when cohort too small", () => {
    const resp: PeerPercentileResp = {
      userId: "u",
      examId: "e",
      topicId: "t",
      hidden: true,
      reason: "cohort_too_small",
      cohortSize: 8,
    };
    expect(pillState(resp)).toEqual({
      visible: false,
      hideReason: "cohort_too_small",
    });
  });

  it("renders ordinal label + band when visible", () => {
    const resp: PeerPercentileResp = {
      userId: "u", examId: "e", topicId: "t",
      hidden: false, cohortSize: 230, percentile: 67, userEwa: 0.62,
    };
    const state = pillState(resp);
    expect(state.visible).toBe(true);
    expect(state.label).toBe("67th percentile (N=230)");
    expect(state.band).toBe("mid");
  });
});
