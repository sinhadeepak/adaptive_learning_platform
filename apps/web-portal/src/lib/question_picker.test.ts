// Sprint 11 S11-B — question-picker pure-helper tests.

import { describe, expect, test } from "vitest";

import type { Question } from "./api";
import {
  applyFilters,
  initialPickerState,
  setQuery,
  setTopic,
  toggle,
  topicsInSet,
} from "./question_picker";

function _q(id: string, stem: string, topicId: string): Question {
  return {
    id,
    topicId,
    stem,
    choices: ["a", "b", "c", "d"],
    correctIdx: 0,
    difficultyB: 0,
    discriminationA: 1,
    guessingC: 0,
    language: "en",
    status: "PUBLISHED",
    createdBy: "t-1",
    createdAt: "",
  };
}

const QS: Question[] = [
  _q("q1", "What is Newton's third law?", "t-mech"),
  _q("q2", "Define entropy", "t-thermo"),
  _q("q3", "Solve 2x + 3 = 7", "t-algebra"),
  _q("q4", "Newton's first law states…", "t-mech"),
];

describe("toggle", () => {
  test("adds when missing", () => {
    expect(toggle(initialPickerState, "q1").selected).toEqual(["q1"]);
  });

  test("removes when present", () => {
    const s = { ...initialPickerState, selected: ["q1", "q2"] };
    expect(toggle(s, "q1").selected).toEqual(["q2"]);
  });

  test("preserves order on add", () => {
    let s = initialPickerState;
    s = toggle(s, "a");
    s = toggle(s, "b");
    s = toggle(s, "c");
    expect(s.selected).toEqual(["a", "b", "c"]);
  });
});

describe("applyFilters", () => {
  test("empty filters → return everything", () => {
    expect(applyFilters(QS, initialPickerState).length).toBe(QS.length);
  });

  test("topic filter narrows by topicId", () => {
    const s = setTopic(initialPickerState, "t-mech");
    expect(applyFilters(QS, s).map((q) => q.id)).toEqual(["q1", "q4"]);
  });

  test("query filter is case-insensitive substring on stem", () => {
    const s = setQuery(initialPickerState, "newton");
    expect(applyFilters(QS, s).map((q) => q.id).sort()).toEqual(["q1", "q4"]);
  });

  test("topic + query compose (AND)", () => {
    let s = setTopic(initialPickerState, "t-mech");
    s = setQuery(s, "first");
    expect(applyFilters(QS, s).map((q) => q.id)).toEqual(["q4"]);
  });

  test("query trims whitespace", () => {
    const s = setQuery(initialPickerState, "   newton  ");
    expect(applyFilters(QS, s).length).toBe(2);
  });
});

describe("topicsInSet", () => {
  test("returns distinct sorted topic ids", () => {
    expect(topicsInSet(QS)).toEqual(["t-algebra", "t-mech", "t-thermo"]);
  });

  test("empty input → empty array", () => {
    expect(topicsInSet([])).toEqual([]);
  });
});
