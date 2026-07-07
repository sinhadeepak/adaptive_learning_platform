// Regression test for the Home dashboard's profile → enrolled-exam wiring.
//
// Guards the cross-task integration seam that unit tests miss: the profile
// Response body must be parsed exactly once. A prior version re-read it via
// `profileRes.clone().json()` after `.json()` had already consumed the body,
// which throws "Body already used", got swallowed by the effect's catch, and
// left the enrolled-exam list empty — so the readiness carousel silently fell
// back to its single-exam empty state for every multi-exam student.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { Home } from "./Home";

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

// Stub the heavy shell but render its children + title so the carousel mounts.
vi.mock("../components/vidya/VidyaShell", () => ({
  VidyaShell: ({
    title,
    children,
  }: {
    title: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      {children}
    </div>
  ),
}));

// Route auth.fetch by path, returning real Response objects so body-consumption
// semantics (and any clone-after-read bug) are faithfully reproduced.
const fetchMock = vi.fn(async (path: string) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (path === "/api/v1/profile/me") {
    return json({
      user: { firstName: "Deepak" },
      preferences: { language: "en", dailyGoalMinutes: null },
      exams: [
        { examId: "e1", targetDate: "2027-05-01" },
        { examId: "e2", targetDate: null },
      ],
    });
  }
  if (path === "/api/v1/catalog/exams") {
    return json([
      { id: "e1", code: "NEET", name: "NEET UG" },
      { id: "e2", code: "UPSC_CSE", name: "UPSC Civil Services" },
    ]);
  }
  if (path.startsWith("/api/v1/analytics/multi-exam-summary/")) {
    return json({
      userId: TEST_USER.id,
      exams: [
        { examId: "e1", readinessScore: 0.5, nTopics: 10, weakestTopicId: null, weakestEwa: null, mistakesDue: 0, revisionDue: 0 },
        { examId: "e2", readinessScore: 0.7, nTopics: 8, weakestTopicId: null, weakestEwa: null, mistakesDue: 0, revisionDue: 0 },
      ],
    });
  }
  // Everything else (readiness/streak/activity/mastery/single-exam meta) → empty-ish OK.
  return json({});
});

vi.mock("../lib/api", () => ({
  auth: { fetch: (path: string) => fetchMock(path) },
}));

afterEach(() => {
  fetchMock.mockClear();
});

describe("Home dashboard — enrolled-exam wiring", () => {
  test("populates the readiness carousel from the profile (not the empty state)", async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    // The carousel's first slide shows the first enrolled exam's code. If the
    // profile parse had thrown, we'd see the "Practice 10 more questions"
    // empty hero instead.
    await waitFor(() =>
      expect(screen.getByText(/NEET Readiness/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Practice 10 more questions/i),
    ).not.toBeInTheDocument();
  });
});
