import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./lib/auth-provider";
import { auth } from "./lib/api";
import { routes } from "./routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

beforeEach(() => {
  // Default: stub fetch so any inadvertent network call returns 404 instead of hanging.
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response("not found", { status: 404 })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

interface TestUser {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  onboardingState?: "NEW" | "EXAM_SELECTED" | "ONBOARDED";
}

function asAuthenticated(user: TestUser = {}): void {
  const u = {
    id: "u-test",
    email: "test@example.com",
    firstName: "Test",
    lastName: "Student",
    role: "STUDENT",
    onboardingState: "ONBOARDED",
    ...user,
  };
  // Mock fetch responses for the routes the page hits.
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: u, preferences: { language: "en", dailyGoalMinutes: 30 }, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/api/v1/catalog/exams")) {
      return new Response(
        JSON.stringify([
          { id: "e1", code: "JEE_MAIN", name: "JEE Main", subtitle: "Engineering entrance" },
          { id: "e2", code: "NEET", name: "NEET", subtitle: "Medical entrance" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  });
  // Make the AuthProvider see an authenticated state immediately.
  Object.assign(auth, { getUser: () => u, isAuthenticated: () => true });
}

test("/login renders the login form", () => {
  renderAt("/login");
  expect(screen.getByRole("heading", { name: /log in/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^log in$/i })).toBeInTheDocument();
});

test("/ redirects to /login when not authenticated", () => {
  renderAt("/");
  expect(screen.getByRole("heading", { name: /log in/i })).toBeInTheDocument();
});

test("/home without auth redirects to /login", () => {
  renderAt("/home");
  expect(screen.getByRole("heading", { name: /log in/i })).toBeInTheDocument();
});

test("/register renders the create-account form", () => {
  renderAt("/register");
  expect(screen.getByRole("heading", { name: /create account/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
});

test("/verify without userId shows missing-context message", () => {
  renderAt("/verify");
  expect(screen.getByText(/missing verification context/i)).toBeInTheDocument();
});

test("/verify with userId renders 6 OTP cells", () => {
  renderAt("/verify?userId=u-1&email=a%40b&kind=email");
  expect(screen.getByRole("heading", { name: /verify your email/i })).toBeInTheDocument();
  for (let i = 1; i <= 6; i++) {
    expect(screen.getByLabelText(`Digit ${i} of 6`)).toBeInTheDocument();
  }
});

test("/forgot-password renders form (Sprint 3)", () => {
  renderAt("/forgot-password");
  expect(screen.getByRole("heading", { name: /forgot your password/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
});

test("/reset-password missing token surfaces guidance", () => {
  renderAt("/reset-password");
  expect(screen.getByRole("heading", { name: /set a new password/i })).toBeInTheDocument();
  expect(screen.getByText(/missing reset token/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /update password/i })).toBeDisabled();
});

test("/reset-password with token enables submission", () => {
  renderAt("/reset-password?token=abcdef0123456789abcdef");
  expect(screen.getByRole("heading", { name: /set a new password/i })).toBeInTheDocument();
  // Both password fields render.
  expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  // Submit is enabled with a valid token (form-level validation gates further).
  expect(screen.getByRole("button", { name: /update password/i })).toBeEnabled();
});

test("/onboarding/exam without auth redirects to /login", () => {
  renderAt("/onboarding/exam");
  expect(screen.getByRole("heading", { name: /log in/i })).toBeInTheDocument();
});

test("/home renders greeting when authenticated + onboarded", () => {
  asAuthenticated({ firstName: "Rahul", onboardingState: "ONBOARDED" });
  renderAt("/home");
  expect(screen.getByRole("heading", { name: /Rahul/ })).toBeInTheDocument();
});

test("/home shows empty readiness state for fresh user (nTopics=0)", async () => {
  asAuthenticated({ id: "u-fresh", onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Test" }, preferences: { language: "en", dailyGoalMinutes: 30 }, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/api/v1/analytics/readiness/u-fresh")) {
      return new Response(
        JSON.stringify({ userId: "u-fresh", scope: "GLOBAL", score: 0.0, nTopics: 0, updatedAt: null }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/api/v1/analytics/mastery/u-fresh")) {
      return new Response(
        JSON.stringify({ userId: "u-fresh", topics: [] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/home");
  // New shell shows the empty-state copy for fresh users + a "Browse subjects"
  // primary action; both the hero copy and the empty-readiness ring (score 0)
  // are visible. Old assertion looked for the legacy ScoreRing aria-label
  // which was removed when the canonical ReadinessRing took over.
  expect(await screen.findByText(/take your first quiz/i)).toBeInTheDocument();
  expect(await screen.findByRole("img", { name: /readiness 0%/i })).toBeInTheDocument();
  expect(await screen.findByText(/browse subjects/i)).toBeInTheDocument();
});

test("/home renders readiness percent + per-topic mastery bars when user has activity", async () => {
  asAuthenticated({ id: "u-active", firstName: "Priya", onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Priya" }, preferences: { language: "en", dailyGoalMinutes: 45 }, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/api/v1/analytics/readiness/u-active")) {
      return new Response(
        JSON.stringify({ userId: "u-active", scope: "GLOBAL", score: 0.72, nTopics: 2, updatedAt: new Date().toISOString() }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/api/v1/analytics/mastery/u-active")) {
      return new Response(
        JSON.stringify({
          userId: "u-active",
          topics: [
            { topicId: "t-mech", ewa: 0.85, n: 3 },
            { topicId: "t-thermo", ewa: 0.6, n: 1 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/api/v1/catalog/topics/t-mech")) {
      return new Response(JSON.stringify({ id: "t-mech", title: "Mechanics" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/api/v1/catalog/topics/t-thermo")) {
      return new Response(JSON.stringify({ id: "t-thermo", title: "Thermodynamics" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/home");
  // New shell renders readiness as a SVG ring + a 72% KPI tile rather than a
  // "Readiness 72%" sentence. Score is also accessible via the ring's role=img.
  expect(await screen.findByRole("img", { name: /readiness 72%/i })).toBeInTheDocument();
  // Sorted highest-first: Mechanics 85% before Thermodynamics 60%.
  const mechanics = await screen.findByText("Mechanics");
  const thermo = await screen.findByText("Thermodynamics");
  expect(mechanics).toBeInTheDocument();
  expect(thermo).toBeInTheDocument();
  expect(screen.getByText("85%")).toBeInTheDocument();
  expect(screen.getByText("60%")).toBeInTheDocument();
  // n=3 + n=1 — meta string formats vary slightly under the new SubjectRow;
  // assert the digit + "session(s)" substring without locking the surrounding
  // markup.
  expect(screen.getByText(/3 sessions?/)).toBeInTheDocument();
  expect(screen.getByText(/1 session\b/)).toBeInTheDocument();
});

test("/catalog lists exams when authenticated", async () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  renderAt("/catalog");
  expect(screen.getByRole("heading", { name: /^catalog$/i })).toBeInTheDocument();
  expect(await screen.findByText(/JEE Main/)).toBeInTheDocument();
  expect(await screen.findByText(/NEET/)).toBeInTheDocument();
});

test("/catalog/exam/:id lists subjects + topics", async () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/v1/catalog/exams/e1/subjects")) {
      return new Response(
        JSON.stringify([{ id: "s1", examId: "e1", name: "Physics", topicCount: 1 }]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/api/v1/catalog/subjects/s1/topics")) {
      return new Response(
        JSON.stringify([{ id: "t1", subjectId: "s1", title: "Mechanics", questionCount: 48, tier: "FREE" }]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/catalog/exam/e1");
  expect(await screen.findByRole("heading", { name: /Physics/ })).toBeInTheDocument();
  expect(await screen.findByText(/Mechanics/)).toBeInTheDocument();
  expect(await screen.findByText(/48 questions/)).toBeInTheDocument();
});

test("/catalog/topic/:id renders topic detail with active quiz CTA (Sprint 3)", async () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/v1/catalog/topics/t1")) {
      return new Response(
        JSON.stringify({
          id: "t1",
          subjectId: "s1",
          title: "Mechanics",
          description: "Motion, forces, and energy.",
          questionCount: 48,
          tier: "FREE",
          objectives: ["Define moment of inertia"],
          prerequisites: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/catalog/topic/t1");
  expect(await screen.findByRole("heading", { name: /Mechanics/ })).toBeInTheDocument();
  expect(await screen.findByText(/Motion, forces, and energy/)).toBeInTheDocument();
  // Sprint 3: button is now active. Lessons remain disabled (Sprint 4).
  const quizBtn = screen.getByRole("button", { name: /start practice quiz/i });
  expect(quizBtn).toBeEnabled();
  const lessonsBtn = screen.getByRole("button", { name: /read lesson notes/i });
  expect(lessonsBtn).toBeDisabled();
});

test("/search renders the search input", () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  renderAt("/search");
  expect(screen.getByRole("searchbox")).toBeInTheDocument();
});

// ---- Sprint 3 quiz play ----

test("/quiz/:id renders the current question with 4 choices", async () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/v1/quiz/sessions/sid-1/next")) {
      return new Response(
        JSON.stringify({
          sessionId: "sid-1",
          status: "IN_PROGRESS",
          done: false,
          item: {
            itemIdx: 0,
            questionId: "q-1",
            stem: "What is 2 + 2?",
            choices: ["3", "4", "5", "22"],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/api/v1/quiz/sessions/sid-1")) {
      return new Response(
        JSON.stringify({
          sessionId: "sid-1",
          userId: "u-test",
          topicId: "t1",
          mode: "PRACTICE",
          strategy: "binary_search",
          status: "IN_PROGRESS",
          targetCount: 10,
          servedCount: 0,
          correctCount: 0,
          items: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/quiz/sid-1");
  expect(await screen.findByRole("heading", { name: /what is 2 \+ 2/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /A.*3/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /B.*4/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /C.*5/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /D.*22/ })).toBeInTheDocument();
  // Submit is disabled until a choice is selected.
  const submit = screen.getByRole("button", { name: /submit answer/i });
  expect(submit).toBeDisabled();
});

test("/quiz/:id/result shows score + per-item review", async () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/quiz/sessions/sid-9")) {
      return new Response(
        JSON.stringify({
          sessionId: "sid-9",
          userId: "u-test",
          topicId: "t1",
          mode: "PRACTICE",
          strategy: "binary_search",
          status: "SUBMITTED",
          targetCount: 5,
          servedCount: 5,
          correctCount: 4,
          items: [
            { itemIdx: 0, questionId: "q-aaaaaaaa-1111", answerIdx: 1, isCorrect: true, answered: true },
            { itemIdx: 1, questionId: "q-bbbbbbbb-2222", answerIdx: 0, isCorrect: false, answered: true },
            { itemIdx: 2, questionId: "q-cccccccc-3333", answerIdx: 2, isCorrect: true, answered: true },
            { itemIdx: 3, questionId: "q-dddddddd-4444", answerIdx: 0, isCorrect: true, answered: true },
            { itemIdx: 4, questionId: "q-eeeeeeee-5555", answerIdx: 3, isCorrect: true, answered: true },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/api/v1/catalog/topics/t1")) {
      return new Response(
        JSON.stringify({ id: "t1", subjectId: "s1", title: "Mechanics" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/quiz/sid-9/result");
  // Score number "4/5" — split across spans, so test by text portion.
  expect(await screen.findByText("4")).toBeInTheDocument();
  expect(screen.getByText("/5")).toBeInTheDocument();
  expect(screen.getByText("80%")).toBeInTheDocument();
  // 5 items rendered.
  expect(screen.getByText("Q1")).toBeInTheDocument();
  expect(screen.getByText("Q5")).toBeInTheDocument();
});
