// Exam-scoped Practice page tests (Task 6).
//
// Verifies:
//   - With ?examId=E1 in the route, the page calls mastery with exam_id=E1.
//   - The page calls /catalog/exams/E1/subjects-with-topics.
//   - The page does NOT call /analytics/topic-decay/.
//   - A topic present in exam topics but absent from mastery renders "Not started".

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { Practice } from "../Practice";

// Mock the auth module so auth.fetch is a vi.fn() we can control.
vi.mock("../../lib/api", () => ({
  auth: { fetch: vi.fn() },
}));

// Mock session-start (dynamic import inside startQuiz).
vi.mock("../../lib/session-start", () => ({
  contentLanguageField: async () => ({}),
}));

// auth-provider hook — return a stable user so the effect fires.
vi.mock("../../lib/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "u-test",
      email: "t@example.com",
      firstName: "T",
      role: "STUDENT" as const,
      onboardingState: "ONBOARDED" as const,
    },
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// VidyaShell — heavy chrome we don't need in unit tests.
vi.mock("../../components/vidya/VidyaShell", () => ({
  VidyaShell: ({
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

// Stub dashboard components (Banner, Pill, strengthFor).
vi.mock("../../components/dashboard", () => ({
  Banner: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  strengthFor: (ewa: number) => {
    if (ewa >= 0.7) return "STRONG";
    if (ewa >= 0.4) return "DEVELOPING";
    if (ewa > 0) return "WEAK";
    return "UNTESTED";
  },
}));

// Stub stats component (MasteryBar).
vi.mock("../../components/stats", () => ({
  MasteryBar: ({ ewa }: { ewa: number }) => <div data-testid="mastery-bar">{ewa}</div>,
}));

// Import auth after mocking so we get the mock version.
import { auth } from "../../lib/api";

// ── Helpers ─────────────────────────────────────────────────────────────────

// Always create a fresh Response so the body is never "already consumed".
function makeResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function profileResp() {
  return makeResp({ user: { firstName: "T" }, exams: [{ examId: "E1", targetDate: null }] });
}
function masteryResp() {
  return makeResp({ userId: "u-test", topics: [{ topicId: "t-known", ewa: 0.55, n: 3 }] });
}
function examTopicsResp() {
  return makeResp({
    topics: [
      { id: "t-known", title: "Known Topic", subjectName: "Physics", examName: "NEET" },
      { id: "t-new", title: "New Topic", subjectName: "Chemistry", examName: "NEET" },
    ],
  });
}
function emptyResp() { return makeResp({}); }
function emptyItemsResp() { return makeResp({ items: [] }); }
function guidedResp() { return makeResp({ headline: "", steps: [], source: "heuristic" }); }
function streakResp() { return makeResp({ currentStreak: 0, longestStreak: 0, lastActiveDate: null }); }
function topicDetailResp(id: string, title: string) { return makeResp({ id, title, subjectId: "s1" }); }

// Default mock: dispatch the right response per URL.
// Each call to makeResp produces a fresh Response body (no "already consumed" risk).
function defaultFetch(url: string): Promise<Response> {
  if (url.includes("/profile/me")) return Promise.resolve(profileResp());
  if (url.includes("/catalog/exams/E1/subjects-with-topics")) return Promise.resolve(examTopicsResp());
  if (url.includes("/analytics/mastery/")) return Promise.resolve(masteryResp());
  if (url.includes("/analytics/streak/")) return Promise.resolve(streakResp());
  if (url.includes("/adaptive/guided-next-steps/")) return Promise.resolve(guidedResp());
  // Return 404 so setReadinessBand is never called — avoids band.replace crash.
  if (url.includes("/analytics/readiness-band/")) return Promise.resolve(new Response("", { status: 404 }));
  if (url.includes("/analytics/revision/")) return Promise.resolve(emptyItemsResp());
  // topic-decay should NOT be called — signal a hard error if it ever is.
  if (url.includes("/analytics/topic-decay/")) return Promise.resolve(new Response("should not be called", { status: 500 }));
  if (url.includes("/catalog/topics/t-known")) return Promise.resolve(topicDetailResp("t-known", "Known Topic"));
  if (url.includes("/catalog/topics/")) return Promise.resolve(topicDetailResp("t-unknown", "Unknown Topic"));
  return Promise.resolve(emptyResp());
}

beforeEach(() => {
  vi.mocked(auth.fetch).mockImplementation(defaultFetch as typeof auth.fetch);
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderPractice(search = "?examId=E1") {
  return render(
    <MemoryRouter initialEntries={[`/practice${search}`]}>
      <Practice />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Practice page — exam-scoped (Task 6)", () => {
  test("calls mastery endpoint with exam_id=E1", async () => {
    renderPractice("?examId=E1");
    await waitFor(() => {
      const calls = vi.mocked(auth.fetch).mock.calls.map(([url]) => url as string);
      expect(calls.some((u) => u.includes("/analytics/mastery/") && u.includes("exam_id=E1"))).toBe(true);
    });
  });

  test("calls /catalog/exams/E1/subjects-with-topics", async () => {
    renderPractice("?examId=E1");
    await waitFor(() => {
      const calls = vi.mocked(auth.fetch).mock.calls.map(([url]) => url as string);
      expect(calls.some((u) => u.includes("/catalog/exams/E1/subjects-with-topics"))).toBe(true);
    });
  });

  test("does NOT call /analytics/topic-decay/", async () => {
    renderPractice("?examId=E1");
    // Wait for the mastery call to confirm data loading happened.
    await waitFor(() => {
      const calls = vi.mocked(auth.fetch).mock.calls.map(([url]) => url as string);
      expect(calls.some((u) => u.includes("/analytics/mastery/"))).toBe(true);
    });
    const calls = vi.mocked(auth.fetch).mock.calls.map(([url]) => url as string);
    expect(calls.some((u) => u.includes("/analytics/topic-decay/"))).toBe(false);
  });

  test("topic present in exam topics but absent from mastery renders 'Not started'", async () => {
    renderPractice("?examId=E1");
    // Wait until the exam topics are fetched and rendered.
    await waitFor(() => {
      expect(screen.getByText("Not started")).toBeInTheDocument();
    });
    // The "Not started" label should appear for the topic that has no mastery data.
    expect(screen.getByText("New Topic")).toBeInTheDocument();
  });

  test("topic with mastery data renders session count instead of 'Not started'", async () => {
    renderPractice("?examId=E1");
    // Wait for "3 sessions" to appear — this means mastery and exam topics both loaded.
    // The topic appears in both examDrills and "Recently practiced", so multiple instances.
    await waitFor(() => {
      expect(screen.getAllByText("3 sessions").length).toBeGreaterThanOrEqual(1);
    });
    // Known Topic appears at least once.
    expect(screen.getAllByText("Known Topic").length).toBeGreaterThanOrEqual(1);
    // Only one topic is "not started" (t-new has no mastery data).
    const notStarted = screen.getAllByText("Not started");
    expect(notStarted).toHaveLength(1);
  });

  test("guided-next-steps URL includes exam_id=E1", async () => {
    renderPractice("?examId=E1");
    await waitFor(() => {
      const calls = vi.mocked(auth.fetch).mock.calls.map(([url]) => url as string);
      expect(calls.some((u) => u.includes("/adaptive/guided-next-steps/") && u.includes("exam_id=E1"))).toBe(true);
    });
  });

  test("readiness-band URL includes exam_id=E1", async () => {
    renderPractice("?examId=E1");
    await waitFor(() => {
      const calls = vi.mocked(auth.fetch).mock.calls.map(([url]) => url as string);
      expect(calls.some((u) => u.includes("/analytics/readiness-band/") && u.includes("exam_id=E1"))).toBe(true);
    });
  });
});
