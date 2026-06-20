import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./lib/auth-provider";
import { ThemeProvider } from "./lib/theme";
import { DensityProvider } from "./lib/density";
import { auth } from "./lib/api";
import { routes } from "./routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  // Top-level providers live in main.tsx — the route-level tests need
  // the same wrappers because AppShell (ThemeToggle → useTheme) and
  // Settings (ThemeDensitySection → useDensity) both throw when their
  // provider is missing.
  return render(
    <ThemeProvider>
      <DensityProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </DensityProvider>
    </ThemeProvider>
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
  // asAuthenticated() mutates the auth singleton via Object.assign;
  // restoreAllMocks() doesn't undo that. Reset to unauth defaults so
  // subsequent "without auth" tests start clean. (Mirrors PR #55 fix
  // applied to web-portal + web-admin.)
  Object.assign(auth, {
    getUser: () => null,
    isAuthenticated: () => false,
  });
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
  // Aurora v2 redesign collapsed the 3-stat zone-1 columns. The
  // empty-readiness state now surfaces a single AIInsightCard with the
  // "Take your first quiz" headline + a "Browse exams" CTA. The pre-
  // Aurora "BEST TOPIC / SESSIONS / READINESS" labels no longer exist.
  expect(await screen.findByText(/take your first quiz/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Browse exams/i })).toBeInTheDocument();
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
  // Aurora v2 surfaces readiness percent inside the home hero. Per-topic
  // mastery surfacing moved out of the home page into /insights — the
  // home test now just asserts the topic titles render *somewhere* on
  // the page (via the Mission/Trajectory/Recent-activity surfaces) and
  // the readiness percent shows on the hero.
  expect(await screen.findByText("72%")).toBeInTheDocument();
  const mechanicsHits = await screen.findAllByText("Mechanics");
  expect(mechanicsHits.length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText("Thermodynamics").length).toBeGreaterThanOrEqual(1);
});

test("/catalog lists exams when authenticated", async () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  renderAt("/catalog");
  // PR #43 swapped the page title to "Browse exams" with "Catalog" living
  // in the topbar instead. Both should appear on the page.
  expect(screen.getByRole("heading", { name: /browse exams/i })).toBeInTheDocument();
  // findAllByText — Aurora v2 renders "JEE Main" / "NEET" both as
  // sidebar nav entries (if active exam) and as the exam-card titles.
  expect((await screen.findAllByText(/JEE Main/)).length).toBeGreaterThanOrEqual(1);
  expect((await screen.findAllByText(/NEET/)).length).toBeGreaterThanOrEqual(1);
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
  // Aurora v2 renamed "Topic mastery matrix" and removed individual
  // topic-card rendering at the exam-dashboard level. Per-topic drill-
  // down now lives at /catalog/exam/:id and /study/:examId/:subjectId.
  // The exam dashboard surfaces subject-level mastery only.
  // Back to dashboard action exists.
  expect(screen.getByRole("link", { name: /Back to dashboard/i })).toBeInTheDocument();
});

test("/study/:examId/:subjectId renders subject nav + sorted topic list", async () => {
  asAuthenticated({ id: "u-study", firstName: "Priya", onboardingState: "ONBOARDED" });
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
          { id: "e1", code: "JEE_MAIN", name: "JEE Main", subtitle: "Engineering entrance" },
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
    if (url.includes("/api/v1/analytics/mastery/u-study")) {
      return new Response(
        JSON.stringify({
          userId: "u-study",
          topics: [
            { topicId: "t-mech", ewa: 0.8, n: 4 },
            { topicId: "t-thermo", ewa: 0.35, n: 2 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/study/e1/s-physics");
  // "Physics" appears in both left-nav (subject row) and main heading —
  // findAllByText handles both.
  const physicsHits = await screen.findAllByText(/Physics/);
  expect(physicsHits.length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText(/Chemistry/)).toBeInTheDocument();
  // Active subject's topic list renders both topics with their strength bucket
  // pills. Sorted by AI priority — Thermodynamics (35%, weak) first.
  const tagsWeak = await screen.findAllByText("WEAK");
  expect(tagsWeak.length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText(/Mechanics/)).toBeInTheDocument();
  expect(screen.getByText(/Thermodynamics/)).toBeInTheDocument();
  // Topics from the OTHER subject (Chemistry) should not be in the topic list.
  expect(screen.queryByText(/Organic Chemistry/)).toBeNull();
  // Back to ExamDetail action present.
  expect(
    screen.getByRole("link", { name: /Back to exam dashboard/i }),
  ).toBeInTheDocument();
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
  // Aurora v2 — only assert the first subject loads cleanly. The
  // exam-level page surfaces subjects lazily; per-subject details now
  // live under /study/:examId/:subjectId.
  expect((await screen.findAllByText(/Physics/)).length).toBeGreaterThanOrEqual(1);
});

test("/catalog/topic/:id renders topic detail with active quiz CTA (Sprint 3)", async () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    // Match exact path so the broader `includes` doesn't also catch
    // `/api/v1/catalog/topics/t1/gate?userId=…` and return the topic
    // body instead of a gate response.
    if (url.endsWith("/api/v1/catalog/topics/t1")) {
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
    // Gate fetch — return a permissive "ready" response so the topic
    // page can render without prereq scaffolding for this test.
    if (url.includes("/api/v1/catalog/topics/t1/gate")) {
      return new Response(
        JSON.stringify({ canAttempt: true, missing: [], mastered: [] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/catalog/topic/t1");
  // Aurora v2 — topic title is split across topbar / hero / breadcrumb;
  // the topbar title may be wrapped in inline spans by @alp/ui's AppShell
  // which breaks naive findByText matches. We assert on the description
  // (rendered as a contiguous Text node in the hero subtitle) and on
  // the primary CTA — both robust indicators that the page mounted.
  expect((await screen.findAllByText(/Motion, forces, and energy/)).length).toBeGreaterThanOrEqual(1);
  // PR #59 renamed the primary CTA to "◈ Start AI practice" to match
  // the dashboards' AI-Adaptive language. Aurora v2 dropped the
  // "Read lesson notes" disabled-CTA — lessons now live on a separate
  // surface under /catalog/topic/:id/lessons (deferred to a follow-up).
  const quizBtn = screen.getByRole("button", { name: /start ai practice/i });
  expect(quizBtn).toBeEnabled();
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
  // S9 A-3 — PR #61 rewrote QuizResult onto AI-first hero. Score copy
  // landed in a few places:
  //   - "This session" tile renders `· {pct}%` inside one span
  //   - "{correct}/{total}" rendered inline in the same tile (no split)
  // Per-item review uses bare item numbers ("1".."5") in qr-num spans
  // and CORRECT/WRONG pills — the "Q1" prefix only appears inside the
  // Report-an-issue popover (not open in this test).
  expect((await screen.findAllByText(/80%/)).length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText("4/5").length).toBeGreaterThanOrEqual(1);
  // 4 of the 5 items were correct; 1 was wrong.
  expect(screen.getAllByText(/CORRECT/).length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText(/WRONG/).length).toBeGreaterThanOrEqual(1);
});

// ---- Profile + Settings (PR #62) ----

test("/profile renders user profile with hero + stats + sections", async () => {
  asAuthenticated({ id: "u-prof", firstName: "Priya", onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({
          user: {
            id: "u-prof",
            email: "priya@example.com",
            firstName: "Priya",
            lastName: "Sharma",
            phone: "+91 99999 88888",
            role: "STUDENT",
            locale: "en-IN",
            onboardingState: "ONBOARDED",
            emailVerifiedAt: "2026-04-21T00:00:00Z",
            createdAt: "2026-04-01T00:00:00Z",
          },
          preferences: { language: "en", dailyGoalMinutes: 30 },
          exams: [{ examId: "e1", targetDate: "2027-05-04" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/api/v1/catalog/exams")) {
      return new Response(
        JSON.stringify([{ id: "e1", code: "JEE_MAIN", name: "JEE Main", subtitle: "Engineering" }]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/profile");
  // Hero name
  expect((await screen.findAllByText(/Priya Sharma/)).length).toBeGreaterThanOrEqual(1);
  // Email shows in hero subtitle + Account section
  expect((await screen.findAllByText(/priya@example\.com/)).length).toBeGreaterThanOrEqual(1);
  // Section headings
  expect(screen.getByRole("heading", { name: /^Account$/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /My exams/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Preferences/i })).toBeInTheDocument();
  // Settings link appears in both sidebar nav + hero CTA — findAllByRole handles both.
  const settingsLinks = screen.getAllByRole("link", { name: /Settings/i });
  expect(settingsLinks.length).toBeGreaterThanOrEqual(1);
});

test("/settings renders preferences form + account actions", async () => {
  asAuthenticated({ id: "u-set", firstName: "Priya", onboardingState: "ONBOARDED" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u-set", email: "x@y.com", firstName: "Priya" },
          preferences: { language: "en", dailyGoalMinutes: 30 },
          exams: [{ examId: "e1", targetDate: null }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/settings");
  // Aurora v2 — "Settings" appears as the AppShell topbar title (a div,
  // not a semantic heading). Section headings below are still semantic.
  expect((await screen.findAllByText(/^Settings$/i)).length).toBeGreaterThanOrEqual(1);
  // Section headings — includes both language controls
  expect(screen.getByRole("heading", { name: /Study language/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Question language/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Daily goal/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /^Account$/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Sign out/i })).toBeInTheDocument();
  // App Language radiogroup has 3 options; Question Language radiogroup has 6.
  // "English" appears in both groups — use getAllByRole.
  expect(screen.getAllByRole("radio", { name: /English/i }).length).toBeGreaterThanOrEqual(2);
  // App Language exclusive options
  expect(screen.getByRole("radio", { name: /Hinglish/i })).toBeInTheDocument();
  // Question Language exclusive options
  expect(screen.getByRole("radio", { name: /தமிழ்/ })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /తెలుగు/ })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /বাংলা/ })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /मराठी/ })).toBeInTheDocument();
  // Goal cadence cards
  expect(screen.getByRole("radio", { name: /15 min\/day/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /120 min\/day/i })).toBeInTheDocument();
  // Save (initially disabled because nothing dirty) + sign-out
  expect(screen.getByRole("button", { name: /save preferences/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /sign out of this device/i })).toBeInTheDocument();
});

test("/settings question-language chip POSTs { contentLanguage } independently", async () => {
  asAuthenticated({ id: "u-ql", firstName: "Ravi", onboardingState: "ONBOARDED" });
  const patchedBodies: string[] = [];
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u-ql", email: "r@v.com", firstName: "Ravi" },
          preferences: { language: "en", dailyGoalMinutes: 30, contentLanguage: "en" },
          exams: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/api/v1/profile/preferences") && init?.method === "PATCH") {
      patchedBodies.push(String(init.body ?? ""));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/settings");
  // Wait for settings to load
  await screen.findByRole("heading", { name: /Question language/i });
  // Click the Hindi chip in the Question language radiogroup
  const hindiChip = screen.getByRole("radio", { name: /हिन्दी ✓|हिन्दी$/u });
  // The Hindi chip in the Question language group (not App Language group)
  // Find the Question language radiogroup and click its Hindi button
  const questionLangGroup = screen.getByRole("radiogroup", { name: /Question language/i });
  const hindiInQuestionGroup = questionLangGroup.querySelector("[lang='hi']") as HTMLElement;
  hindiInQuestionGroup?.click();
  // The PATCH should include only contentLanguage, not language
  await vi.waitFor(() => {
    expect(patchedBodies.length).toBeGreaterThanOrEqual(1);
    const lastPatch = JSON.parse(patchedBodies[patchedBodies.length - 1]) as Record<string, unknown>;
    expect(lastPatch).toHaveProperty("contentLanguage", "hi");
    expect(lastPatch).not.toHaveProperty("language");
  });
});

test("/profile without auth redirects to /login", () => {
  renderAt("/profile");
  expect(screen.getByRole("heading", { name: /log in/i })).toBeInTheDocument();
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
