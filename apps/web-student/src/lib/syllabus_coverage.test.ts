// Sprint 28 (P4-S28) — pure-function tests for syllabus coverage helpers.

import { describe, expect, it } from "vitest";

import {
  chapterStatusColour,
  chapterStatusLabel,
  chaptersRemaining,
  type CoverageResponse,
} from "./syllabus_coverage";

const COVERAGE: CoverageResponse = {
  examId: "e-jee",
  overallPct: 30,
  totalTopics: 7,
  masteredTopics: 2,
  subjects: [
    {
      subjectId: "s-phy",
      name: "Physics",
      totalChapters: 5,
      coveredChapters: 1,
      totalTopics: 3,
      attemptedTopics: 2,
      masteredTopics: 1,
      chapters: [
        { chapterId: "c-mech", name: "Mechanics", totalTopics: 1, attemptedTopics: 1, masteredTopics: 1, avgEwa: 0.8, status: "mastered" },
        { chapterId: "c-thermo", name: "Thermodynamics", totalTopics: 1, attemptedTopics: 1, masteredTopics: 0, avgEwa: 0.45, status: "developing" },
        { chapterId: "c-elec", name: "Electrostatics", totalTopics: 1, attemptedTopics: 0, masteredTopics: 0, avgEwa: 0, status: "not_started" },
        { chapterId: "c-modern", name: "Modern Physics", totalTopics: 0, attemptedTopics: 0, masteredTopics: 0, avgEwa: 0, status: "missing" },
        { chapterId: "c-optics", name: "Optics", totalTopics: 0, attemptedTopics: 0, masteredTopics: 0, avgEwa: 0, status: "missing" },
      ],
    },
  ],
};

describe("chapterStatusLabel", () => {
  it("maps each status to a human label", () => {
    expect(chapterStatusLabel("mastered")).toBe("Mastered");
    expect(chapterStatusLabel("developing")).toBe("In progress");
    expect(chapterStatusLabel("not_started")).toBe("Not started");
    expect(chapterStatusLabel("missing")).toBe("No topics yet");
  });
});

describe("chapterStatusColour", () => {
  it("uses the green token for mastered", () => {
    expect(chapterStatusColour("mastered")).toContain("color-green");
  });

  it("uses the amber token for missing (content gap)", () => {
    expect(chapterStatusColour("missing")).toContain("color-amber");
  });
});

describe("chaptersRemaining", () => {
  it("counts every chapter that isn't mastered (including missing)", () => {
    expect(chaptersRemaining(COVERAGE)).toBe(4);
  });

  it("returns 0 when every chapter is mastered", () => {
    const all: CoverageResponse = {
      ...COVERAGE,
      subjects: [
        {
          ...COVERAGE.subjects[0],
          chapters: COVERAGE.subjects[0].chapters.map((c) => ({ ...c, status: "mastered" })),
        },
      ],
    };
    expect(chaptersRemaining(all)).toBe(0);
  });
});
