// Smoke tests for the WeeklyNarrativeCard component (Phase 6 S53).

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import {
  WeeklyNarrativeCard,
  WeeklyNarrativeEmpty,
} from "./WeeklyNarrativeCard";
import type { NarrativeRecord } from "../lib/weekly-narrative";

function record(overrides: Partial<NarrativeRecord> = {}): NarrativeRecord {
  return {
    id: "n-1",
    userId: "u-1",
    weekStart: "2026-05-11",
    source: "ai",
    model: "gpt-4o-mini",
    promptTemplateId: "weekly_narrative",
    promptTemplateVersion: "1.0.0",
    isDelta: false,
    deltaTrigger: null,
    narrative: {
      improved: {
        text: "You went from 58% to 71% on Newton's third law.",
        data_link: "concept_mastery_delta:newton-3:0.58→0.71",
      },
      slipping: {
        text: "Stoichiometry decayed by 8% in 5 days.",
        data_link: "topic_decay:stoich:8%",
      },
      hidden_pattern: {
        text: "You're 14% faster on morning sessions.",
      },
      forecast: {
        text: "Trajectory holds at current pace — mocks help calibrate.",
      },
      week_ahead: {
        text: "Focus on three things this week.",
        actions: ["Drill Newton 3", "Take a 30-min mock", "Review error patterns"],
      },
    },
    ...overrides,
  };
}

function renderCard(r: NarrativeRecord) {
  return render(
    <MemoryRouter>
      <WeeklyNarrativeCard record={r} />
    </MemoryRouter>,
  );
}

describe("WeeklyNarrativeCard", () => {
  test("renders all 5 section eyebrows + texts", () => {
    renderCard(record());
    for (const eyebrow of [
      "Improved",
      "Slipping",
      "Hidden pattern",
      "Forecast",
      "Week ahead",
    ]) {
      expect(screen.getByText(eyebrow)).toBeInTheDocument();
    }
    expect(
      screen.getByText(/You went from 58% to 71% on Newton/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Focus on three things this week/),
    ).toBeInTheDocument();
  });

  test("week-ahead action bullets render in order", () => {
    renderCard(record());
    expect(screen.getByText("Drill Newton 3")).toBeInTheDocument();
    expect(screen.getByText("Take a 30-min mock")).toBeInTheDocument();
    expect(screen.getByText("Review error patterns")).toBeInTheDocument();
  });

  test("source pill says 'AI' for ai-sourced narratives", () => {
    renderCard(record({ source: "ai" }));
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  test("source pill says 'Heuristic' when LLM disabled", () => {
    renderCard(record({ source: "heuristic" }));
    expect(screen.getByText("Heuristic")).toBeInTheDocument();
  });

  test("delta eyebrow only shows for delta narratives", () => {
    const { rerender } = renderCard(record());
    expect(screen.queryByText(/Mid-week update/)).toBeNull();
    rerender(
      <MemoryRouter>
        <WeeklyNarrativeCard
          record={record({
            isDelta: true,
            deltaTrigger: "mastery dropped 12%",
          })}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/Mid-week update — mastery dropped 12%/),
    ).toBeInTheDocument();
  });

  test("data_link present → 'Why' link appears + targets the parsed route", () => {
    renderCard(record());
    const conceptLink = screen.getByText(/See concept profile/);
    expect(conceptLink).toBeInTheDocument();
    expect(conceptLink.closest("a")?.getAttribute("href")).toBe(
      "/concept-profile",
    );
    expect(screen.getByText(/See syllabus coverage/)).toBeInTheDocument();
  });

  test("data_link absent → no link rendered (never fake the source)", () => {
    // hidden_pattern + forecast in the fixture have no data_link.
    renderCard(record());
    // Two sections have links, three don't.
    const allWhyLinks = screen.queryAllByText(/See|Open/);
    expect(allWhyLinks.length).toBeGreaterThanOrEqual(2);
    expect(allWhyLinks.length).toBeLessThanOrEqual(3);
  });

  test("week range displays Mon–Sun bracket", () => {
    renderCard(record());
    expect(screen.getByText(/May 11/)).toBeInTheDocument();
    expect(screen.getByText(/May 17/)).toBeInTheDocument();
  });
});

describe("WeeklyNarrativeEmpty", () => {
  test("default copy + Generate button fires callback", () => {
    const onGenerate = vi.fn();
    render(
      <MemoryRouter>
        <WeeklyNarrativeEmpty onGenerate={onGenerate} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/We haven't written your weekly narrative yet/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Generate narrative"));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  test("generating=true disables button + shows 'Generating…'", () => {
    render(
      <MemoryRouter>
        <WeeklyNarrativeEmpty onGenerate={() => {}} generating />
      </MemoryRouter>,
    );
    const btn = screen.getByText("Generating…");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  test("error message replaces the default copy + hides the button", () => {
    render(
      <MemoryRouter>
        <WeeklyNarrativeEmpty
          onGenerate={() => {}}
          error="weekly narrative fetch failed: HTTP 500"
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/weekly narrative fetch failed: HTTP 500/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Generate narrative")).toBeNull();
  });
});
