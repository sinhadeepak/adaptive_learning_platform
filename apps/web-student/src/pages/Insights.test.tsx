// Page smoke tests for the Insights hub (Phase 6 S52).
//
// Verifies:
//   - Three zone headings + intro copy.
//   - Empty-state tiles render when the aggregator returns zeros.
//   - Populated tiles render concept rows + readiness pill.
//   - Each tile carries a "Why am I seeing this?" deep link.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { Insights } from "./Insights";

const TEST_USER = {
  id: "u-test",
  email: "t@example.com",
  firstName: "T",
  role: "STUDENT" as const,
  onboardingState: "ONBOARDED" as const,
};

// auth-provider hook — return a stable user so the effect fires.
vi.mock("../lib/auth-provider", () => ({
  useAuth: () => ({ user: TEST_USER }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// AppShell — heavy chrome we don't need in unit tests. Stub it so the
// page mounts without pulling in the full nav.
vi.mock("../components/AppShell", () => ({
  AppShell: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: string;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => emptyResp());
});
afterEach(() => vi.restoreAllMocks());

function emptyResp(): Response {
  return new Response(
    JSON.stringify({
      user_id: "u-test",
      my_state: {
        concept_mastery: [],
        topic_decay: [],
        readiness: null,
      },
      what_this_means: { weak_concepts: [], decay_alerts: [] },
      what_to_do: { missions_today_pending: false, revision_due_today: 0 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function populatedResp(): Response {
  return new Response(
    JSON.stringify({
      user_id: "u-test",
      my_state: {
        concept_mastery: [
          {
            concept_id: "c-aaaaaaaa-1",
            ewa: 0.82,
            n: 7,
            decay_severity: "fresh",
            decay_days: 1,
          },
          {
            concept_id: "c-bbbbbbbb-2",
            ewa: 0.31,
            n: 3,
            decay_severity: "stale",
            decay_days: 12,
          },
        ],
        topic_decay: [
          {
            concept_id: "c-bbbbbbbb-2",
            ewa: 0.31,
            n: 3,
            decay_severity: "stale",
            decay_days: 12,
          },
        ],
        readiness: { score: 0.62, band: "on_track" },
      },
      what_this_means: {
        weak_concepts: [
          {
            concept_id: "c-bbbbbbbb-2",
            ewa: 0.31,
            n: 3,
            decay_severity: "stale",
            decay_days: 12,
          },
        ],
        decay_alerts: [],
      },
      what_to_do: { missions_today_pending: true, revision_due_today: 3 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function renderInsights() {
  return render(
    <MemoryRouter>
      <Insights />
    </MemoryRouter>,
  );
}

describe("Insights hub", () => {
  test("renders all three zone headings + intro", async () => {
    renderInsights();
    await waitFor(() =>
      expect(screen.getByText("My state")).toBeInTheDocument(),
    );
    expect(screen.getByText("What this means")).toBeInTheDocument();
    expect(screen.getByText("What to do")).toBeInTheDocument();
    expect(
      screen.getByText(
        /A single read of where you are, what it means, and what to do next/,
      ),
    ).toBeInTheDocument();
  });

  test("empty snapshot renders 'Building signal' + warming-up copy", async () => {
    renderInsights();
    await waitFor(() =>
      expect(screen.getByText("Building signal")).toBeInTheDocument(),
    );
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByText("Nothing is fading")).toBeInTheDocument();
    expect(screen.getByText("No persistent weak points")).toBeInTheDocument();
    expect(screen.getByText("No decay alerts")).toBeInTheDocument();
    expect(screen.getByText("No mission queued")).toBeInTheDocument();
    expect(screen.getByText("Nothing due today")).toBeInTheDocument();
  });

  test("populated snapshot surfaces readiness pill + concept rows", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async () => populatedResp(),
    );
    renderInsights();
    await waitFor(() =>
      expect(screen.getByText("62%")).toBeInTheDocument(),
    );
    // "On track" appears as both the title and the pill — accept either.
    expect(screen.getAllByText("On track").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2 active concepts")).toBeInTheDocument();
    expect(screen.getByText("1 fading")).toBeInTheDocument();
    expect(screen.getByText("1 weak concept")).toBeInTheDocument();
    expect(screen.getByText("Mission ready")).toBeInTheDocument();
    expect(screen.getByText("3 concepts due today")).toBeInTheDocument();
  });

  test("every tile carries a 'Why am I seeing this?' deep link", async () => {
    renderInsights();
    await waitFor(() =>
      expect(screen.getByText("My state")).toBeInTheDocument(),
    );
    // Default copy on most tiles.
    const whys = screen.getAllByText(/Why am I seeing this/);
    expect(whys.length).toBeGreaterThanOrEqual(3);
    // Tiles with overridden labels still surface a deep link.
    expect(screen.getByText(/What this means →/)).toBeInTheDocument();
    expect(screen.getByText(/Open the report →/)).toBeInTheDocument();
    expect(screen.getByText(/How missions work →/)).toBeInTheDocument();
  });

  test("server error surfaces a danger banner", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async () => new Response("boom", { status: 500 }),
    );
    renderInsights();
    await waitFor(() =>
      expect(
        screen.getByText(/insights snapshot failed: HTTP 500/),
      ).toBeInTheDocument(),
    );
  });
});
