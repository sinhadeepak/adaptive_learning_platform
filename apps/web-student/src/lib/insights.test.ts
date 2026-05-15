// Tests for the Insights hub client + display helpers (Phase 6 S52).

import { describe, expect, test } from "vitest";

import {
  _camelizeForTest,
  decaySeverityLabel,
  readinessBandLabel,
  readinessBandTone,
} from "./insights";

describe("camelize (raw aggregator → typed shape)", () => {
  test("maps a fully populated snapshot", () => {
    const raw = {
      user_id: "u-1",
      my_state: {
        concept_mastery: [
          {
            concept_id: "c-aaa",
            ewa: 0.82,
            n: 7,
            decay_severity: "fresh" as const,
            decay_days: 2,
          },
          {
            concept_id: "c-bbb",
            ewa: 0.31,
            n: 3,
            decay_severity: "stale" as const,
            decay_days: 14,
          },
        ],
        topic_decay: [
          {
            concept_id: "c-bbb",
            ewa: 0.31,
            n: 3,
            decay_severity: "stale" as const,
            decay_days: 14,
          },
        ],
        readiness: { score: 0.62, band: "on_track" as const },
      },
      what_this_means: {
        weak_concepts: [
          {
            concept_id: "c-bbb",
            ewa: 0.31,
            n: 3,
            decay_severity: "stale" as const,
            decay_days: 14,
          },
        ],
        decay_alerts: [],
      },
      what_to_do: {
        missions_today_pending: true,
        revision_due_today: 3,
      },
    };

    const out = _camelizeForTest(raw);

    expect(out.userId).toBe("u-1");
    expect(out.myState.conceptMastery).toHaveLength(2);
    expect(out.myState.conceptMastery[0]).toEqual({
      conceptId: "c-aaa",
      ewa: 0.82,
      n: 7,
      decaySeverity: "fresh",
      decayDays: 2,
    });
    expect(out.myState.readiness).toEqual({ score: 0.62, band: "on_track" });
    expect(out.whatThisMeans.weakConcepts).toHaveLength(1);
    expect(out.whatToDo).toEqual({
      missionsTodayPending: true,
      revisionDueToday: 3,
    });
  });

  test("handles an empty snapshot (new student, warming up)", () => {
    const raw = {
      user_id: "u-new",
      my_state: {
        concept_mastery: [],
        topic_decay: [],
        readiness: null,
      },
      what_this_means: { weak_concepts: [], decay_alerts: [] },
      what_to_do: { missions_today_pending: false, revision_due_today: 0 },
    };

    const out = _camelizeForTest(raw);

    expect(out.myState.conceptMastery).toEqual([]);
    expect(out.myState.readiness).toBeNull();
    expect(out.whatToDo.revisionDueToday).toBe(0);
  });

  test("tolerates a missing concept_mastery array (defensive)", () => {
    // FastAPI shouldn't emit this, but a future schema change shouldn't
    // crash the page. The client coalesces missing arrays to [].
    // Deliberately omitting concept_mastery — the cast at the call
    // site (`as never`) is what suppresses the type error; the test
    // verifies the runtime coalesces missing arrays to [].
    const raw = {
      user_id: "u-x",
      my_state: {
        topic_decay: [],
        readiness: null,
      },
      what_this_means: { weak_concepts: [], decay_alerts: [] },
      what_to_do: { missions_today_pending: false, revision_due_today: 0 },
    };

    const out = _camelizeForTest(raw as never);
    expect(out.myState.conceptMastery).toEqual([]);
  });
});

describe("readinessBandLabel + tone", () => {
  test("approaching → success", () => {
    expect(readinessBandLabel("approaching")).toBe("Approaching target");
    expect(readinessBandTone("approaching")).toBe("success");
  });
  test("on_track → info", () => {
    expect(readinessBandLabel("on_track")).toBe("On track");
    expect(readinessBandTone("on_track")).toBe("info");
  });
  test("behind → warning", () => {
    expect(readinessBandTone("behind")).toBe("warning");
  });
  test("at_risk → danger", () => {
    expect(readinessBandLabel("at_risk")).toBe("At risk");
    expect(readinessBandTone("at_risk")).toBe("danger");
  });
});

describe("decaySeverityLabel", () => {
  test("maps every severity", () => {
    expect(decaySeverityLabel("fresh")).toBe("Fresh");
    expect(decaySeverityLabel("aging")).toBe("Aging");
    expect(decaySeverityLabel("stale")).toBe("Stale");
    expect(decaySeverityLabel("critical")).toBe("Critical");
  });
});
