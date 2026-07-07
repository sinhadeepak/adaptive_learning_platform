// Regression tests for the exam dashboard (ExamDetail).
//
// Guards against the fabricated "stub" literals the page used to render
// (a hardcoded "Aarav's preparation" title, "Rank 1500 · 95th %ile" goal,
// "▲ 18" readiness delta, "from 3,102" prev-rank) and verifies the real
// wiring: Goal Targets reflects profile.targetRank, and Projected Rank comes
// from a real scored mock attempt.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { ExamDetail } from "./ExamDetail";

const TEST_USER = {
  id: "u-test",
  email: "t@example.com",
  firstName: "Deepak",
  role: "STUDENT" as const,
  onboardingState: "ONBOARDED" as const,
};

vi.mock("../lib/auth-provider", () => ({
  useAuth: () => ({ user: TEST_USER }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useParams: () => ({ examId: "e1" }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../components/vidya/VidyaShell", () => ({
  VidyaShell: ({
    title,
    subtitle,
    children,
  }: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <div data-testid="title">{title}</div>
      <div data-testid="subtitle">{subtitle}</div>
      {children}
    </div>
  ),
}));

vi.mock("../lib/recentActivity", () => ({
  fetchRecentTests: async () => [],
  relativeTime: () => "just now",
}));

// Configurable per test.
let profileTargetRank: number | null = null;
let mockAttempts: Array<{
  examCode: string;
  percentile: number | null;
  projectedRank: number | null;
  createdAt: string;
}> = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const fetchMock = vi.fn(async (path: string) => {
  if (path === "/api/v1/profile/me") {
    return json({
      exams: [{ examId: "e1", targetDate: "2027-05-01" }],
      targetRank: profileTargetRank,
    });
  }
  if (path === "/api/v1/profile/mock-attempts") {
    return json({ items: mockAttempts });
  }
  if (path === "/api/v1/catalog/exams") {
    return json({ exams: [{ id: "e1", code: "NEET", name: "NEET UG" }] });
  }
  // subjects / mastery / topics / sessions / blueprints → empty-ish OK.
  if (path.includes("/subjects")) return json({ subjects: [] });
  if (path.includes("/analytics/mastery/")) return json({ topics: [] });
  if (path.includes("/topics")) return json({ topics: [] });
  return json({ items: [] });
});

vi.mock("../lib/api", () => ({
  auth: { fetch: (path: string) => fetchMock(path) },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ExamDetail />
    </MemoryRouter>,
  );
}

afterEach(() => {
  fetchMock.mockClear();
  profileTargetRank = null;
  mockAttempts = [];
});

describe("ExamDetail — honest data", () => {
  test("no fabricated stub literals render", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("title")).toHaveTextContent("NEET UG"),
    );
    expect(screen.queryByText(/Aarav/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rank 1500/)).not.toBeInTheDocument();
    expect(screen.queryByText(/from 3,102/)).not.toBeInTheDocument();
    expect(screen.queryByText(/chapters 18-22/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2 yr plan/)).not.toBeInTheDocument();
  });

  test("Goal Targets shows the empty state when no target rank is set", async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/Set a target rank to track your goal/i),
      ).toBeInTheDocument(),
    );
  });

  test("Goal Targets shows the real target rank when set", async () => {
    profileTargetRank = 2500;
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Rank 2,500/)).toBeInTheDocument(),
    );
  });

  test("Projected rank comes from the latest scored mock attempt", async () => {
    mockAttempts = [
      { examCode: "NEET", percentile: 88, projectedRank: 8420, createdAt: "2026-07-01T00:00:00Z" },
    ];
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/8,420/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/88/)).toBeInTheDocument();
  });
});
