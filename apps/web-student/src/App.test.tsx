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
  // PR #56 rewrote /home as the master dashboard (zones 1-6 from
  // docs/ui/01_StudentPortal_Web/05_master-dashboard.html). Empty-readiness
  // state surfaces the "first quiz" copy in the AI hero subtitle + the three
  // "BEST TOPIC / SESSIONS / READINESS" stat-label columns.
  expect(await screen.findByText(/take your first quiz/i)).toBeInTheDocument();
  expect(screen.getByText("BEST TOPIC")).toBeInTheDocument();
  expect(screen.getByText("SESSIONS")).toBeInTheDocument();
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
  // PR #56 master dashboard surfaces readiness as the third "READINESS" stat
  // in zone 1 (AI hero) — score is rendered as `${pct}%` in .ai-stat-num.
  // Topic mastery list still renders at the bottom of the page (.row-link).
  expect(await screen.findByText("72%")).toBeInTheDocument();
  // The two seeded topics render in zone 6 (recent activity AI tip uses the
  // strongest one) AND in the bottom row-list. findAllByText handles both.
  const mechanicsHits = await screen.findAllByText("Mechanics");
  expect(mechanicsHits.length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText("Thermodynamics").length).toBeGreaterThanOrEqual(1);
  // Bottom topic-list row formats meta as "N sessions · mastery PCT%".
  expect(screen.getByText(/3 sessions.*mastery 85%/i)).toBeInTheDocument();
  expect(screen.getByText(/1 session.*mastery 60%/i)).toBeInTheDocument();
});

test("/catalog lists exams when authenticated", async () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  renderAt("/catalog");
  // PR #43 swapped the page title to "Browse exams" with "Catalog" living
  // in the topbar instead. Both should appear on the page.
  expect(screen.getByRole("heading", { name: /browse exams/i })).toBeInTheDocument();
  expect(await screen.findByText(/JEE Main/)).toBeInTheDocument();
  expect(await screen.findByText(/NEET/)).toBeInTheDocument();
});

test("/exams/:examId renders the per-exam dashboard with hero + subject mastery", async () => {
  asAuthenticated({ id: "u-exam", firstName: "Priya", onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({
          user: { firstName: "Priya" },
          preferences: { language: "en", dailyGoalMinutes: 30 },
          exams: [{ examId: "e1", targetDate: "2027-05-04" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/api/v1/catalog/exams")) {
      return new Response(
        JSON.stringify([
          {
            id: "e1",
            code: "JEE_MAIN",
            name: "JEE Main",
            subtitle: "Engineering entrance",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/api/v1/catalog/exams/e1/subjects")) {
      return new Response(
        JSON.stringify([
          { id: "s-physics", examId: "e1", name: "Physics", topicCount: 2 },
          { id: "s-chem", examId: "e1", name: "Chemistry", topicCount: 1 },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/api/v1/catalog/subjects/s-physics/topics")) {
      return new Response(
        JSON.stringify([
          { id: "t-mech", subjectId: "s-physics", title: "Mechanics", questionCount: 48, tier: "FREE" },
          { id: "t-thermo", subjectId: "s-physics", title: "Thermodynamics", questionCount: 30, tier: "FREE" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/api/v1/catalog/subjects/s-chem/topics")) {
      return new Response(
        JSON.stringify([
          { id: "t-org", subjectId: "s-chem", title: "Organic Chemistry", questionCount: 25, tier: "FREE" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/api/v1/analytics/mastery/u-exam")) {
      return new Response(
        JSON.stringify({
          userId: "u-exam",
          topics: [
            { topicId: "t-mech", ewa: 0.8, n: 4 },
            { topicId: "t-thermo", ewa: 0.35, n: 2 },
            // t-org left out → "not started"
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/exams/e1");
  // "JEE Main" appears in both topbar title (.topbar-title span) and hero
  // h1 — findAllByText handles both. Hero h1 has class "eh-title".
  const titleHits = await screen.findAllByText(/JEE Main/i);
  expect(titleHits.length).toBeGreaterThanOrEqual(1);
  // Subject mastery section title.
  expect(screen.getByRole("heading", { name: /Subject mastery/i })).toBeInTheDocument();
  // Both subjects render in the mastery list.
  expect(await screen.findByText("Physics")).toBeInTheDocument();
  expect(screen.getByText("Chemistry")).toBeInTheDocument();
  // Topic mastery matrix has all three topic cards. Topic names also leak
  // into the AI-recommends banner + insight items, so allow >=1.
  expect(screen.getByRole("heading", { name: /Topic mastery matrix/i })).toBeInTheDocument();
  expect(screen.getAllByText(/Mechanics/).length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText(/Thermodynamics/).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText(/Organic Chemistry/)).toBeInTheDocument();
  // Back to dashboard action exists.
  expect(screen.getByRole("link", { name: /Back to dashboard/i })).toBeInTheDocument();
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

// ---- Onboarding flow (PR #52) ----

test("/onboarding/exam renders the radio-card list when authenticated", async () => {
  asAuthenticated({ onboardingState: "NEW" });
  renderAt("/onboarding/exam");
  // Step indicator caption + question heading
  expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /which exam are you preparing for/i }))
    .toBeInTheDocument();
  // The two seeded exams from asAuthenticated() show up as radio options
  expect(await screen.findByRole("radio", { name: /JEE Main/ })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /NEET/ })).toBeInTheDocument();
  // Continue is disabled until a card is selected
  expect(screen.getByRole("button", { name: /^continue$/i })).toBeDisabled();
});

test("/onboarding/language renders three language cards + skip button", async () => {
  asAuthenticated({ onboardingState: "EXAM_SELECTED" });
  renderAt("/onboarding/language");
  expect(await screen.findByText(/step 2 of 4/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /what language do you want to learn in/i }))
    .toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /English/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /हिन्दी/ })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /Hinglish/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /skip \(defaults to english\)/i }))
    .toBeInTheDocument();
});

test("/onboarding/target-date renders date input + 4 month presets", async () => {
  asAuthenticated({ onboardingState: "EXAM_SELECTED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/v1/profile/me")) {
        return new Response(
          JSON.stringify({
            user: { firstName: "Test", role: "STUDENT", onboardingState: "EXAM_SELECTED" },
            preferences: { language: "en", dailyGoalMinutes: 30 },
            exams: [{ examId: "e1", targetDate: null }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  renderAt("/onboarding/target-date");
  expect(await screen.findByText(/step 3 of 4/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /when is your exam/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/target date/i)).toBeInTheDocument();
  // The 4 preset chips
  expect(screen.getByRole("button", { name: /^3 mos$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^6 mos$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^9 mos$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^12 mos$/i })).toBeInTheDocument();
  // Continue + Not sure yet
  expect(screen.getByRole("button", { name: /^continue$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /not sure yet/i })).toBeInTheDocument();
});

test("/onboarding/daily-goal renders 4 cadence options + start button", async () => {
  asAuthenticated({ onboardingState: "EXAM_SELECTED" });
  renderAt("/onboarding/daily-goal");
  expect(await screen.findByText(/step 4 of 4/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /set your daily goal/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /15 min\/day/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /30 min\/day/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /60 min\/day/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /120 min\/day/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /start learning/i })).toBeInTheDocument();
});
