import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { Login } from "./pages/Login";
import { AuthProvider } from "./lib/auth-provider";
import { auth } from "./lib/api";
import { routes } from "./routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response("not found", { status: 404 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  // asAuthenticated() mutates the auth singleton — reset to unauth defaults
  // so the next test starts clean (mirrors web-admin's afterEach).
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
}

function asAuthenticated(user: TestUser = {}): TestUser {
  const u = {
    id: "u-test",
    email: "test@example.com",
    firstName: "Anika",
    lastName: "Author",
    role: "TEACHER",
    ...user,
  };
  Object.assign(auth, { getUser: () => u, isAuthenticated: () => true });
  return u;
}

test("login page renders email + password fields", () => {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  );
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("/ redirects to /login when not authenticated", () => {
  renderAt("/");
  // Hits / → /questions → /login (ProtectedRoute redirect chain)
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("/questions without auth redirects to /login", () => {
  renderAt("/questions");
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("/questions/new without auth redirects to /login", () => {
  renderAt("/questions/new");
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("/questions renders MyQuestions with empty state when authenticated", async () => {
  asAuthenticated();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Anika", role: "TEACHER" }, preferences: {}, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/content/questions")) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/questions");
  // Empty-state copy renders when there are no drafts. ("My questions" appears
  // in both topbar + sidebar nav, so it's not unique enough for findByText.)
  expect(await screen.findByText(/no questions yet/i)).toBeInTheDocument();
});

test("/questions renders draft + status pills when authoring activity exists", async () => {
  asAuthenticated();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Anika", role: "TEACHER" }, preferences: {}, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/content/questions")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "q-1",
              topicId: "t-1",
              stem: "What is Newton's second law of motion?",
              choices: ["F=ma", "E=mc²", "PV=nRT", "v=u+at"],
              correctIdx: 0,
              difficultyB: 0,
              discriminationA: 1,
              guessingC: 0,
              language: "en",
              status: "DRAFT",
              createdBy: "u-1",
              createdAt: new Date().toISOString(),
            },
            {
              id: "q-2",
              topicId: "t-1",
              stem: "Define entropy.",
              choices: ["Disorder", "Energy", "Force", "Mass"],
              correctIdx: 0,
              difficultyB: 0.4,
              discriminationA: 1,
              guessingC: 0,
              language: "en",
              status: "PUBLISHED",
              createdBy: "u-1",
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/questions");
  expect(await screen.findByText(/Newton's second law/i)).toBeInTheDocument();
  expect(await screen.findByText(/Define entropy/i)).toBeInTheDocument();
  // Status pills
  expect(screen.getByText("DRAFT")).toBeInTheDocument();
  expect(screen.getByText("PUBLISHED")).toBeInTheDocument();
  // The "+ New question" CTA shows for TEACHER role
  expect(screen.getByRole("link", { name: /\+ New question/i })).toBeInTheDocument();
  // Submit-for-review affordance only on the DRAFT row
  expect(screen.getByRole("button", { name: /Submit for review/i })).toBeInTheDocument();
});

test("/questions/new-mcq renders the legacy IRT authoring form", async () => {
  // P5-S58 — /questions/new now hosts the multi-type authoring page
  // (every supported type pickable). The legacy single-type IRT form
  // lives at /questions/new-mcq, which this test exercises.
  asAuthenticated({ role: "TEACHER" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Anika", role: "TEACHER" }, preferences: {}, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/questions/new-mcq");
  expect(await screen.findByText(/New question/i)).toBeInTheDocument();
  // S11-E — PR 906f530 replaced the "Topic ID" text input with a
  // cascading Exam → Subject → Topic dropdown set. The test now looks
  // for the dropdown label instead. The cascade starts disabled until
  // the educator's exams load (mocked above with no exams), so the
  // dropdown's disabled placeholder is what renders.
  expect(screen.getByLabelText(/^Topic$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Stem/i)).toBeInTheDocument();
  // Default 4 choices, A through D
  expect(screen.getByText(/^A\.$/)).toBeInTheDocument();
  expect(screen.getByText(/^D\.$/)).toBeInTheDocument();
  // Difficulty + Language + Save draft
  expect(screen.getByLabelText(/Difficulty/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Language/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Save draft/i })).toBeInTheDocument();
});

test("/review without REVIEWER role shows forbidden message", async () => {
  asAuthenticated({ role: "TEACHER" }); // TEACHER cannot review
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Anika", role: "TEACHER" }, preferences: {}, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/review");
  expect(await screen.findByRole("heading", { name: /Forbidden/i })).toBeInTheDocument();
});

test("/review with MODERATOR role shows the review queue", async () => {
  asAuthenticated({ role: "MODERATOR" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Maya", role: "MODERATOR" }, preferences: {}, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/content/questions") && url.includes("scope=all")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "q-rev",
              topicId: "t-1",
              stem: "Pending review question",
              choices: ["Option 1", "Option 2", "Option 3", "Option 4"],
              correctIdx: 1,
              difficultyB: 0,
              discriminationA: 1,
              guessingC: 0,
              language: "en",
              status: "REVIEW",
              createdBy: "u-other",
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/review");
  expect(await screen.findByText(/Review queue/i)).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /Pending review question/i })).toBeInTheDocument();
  // Approve + Reject actions
  expect(screen.getByRole("button", { name: /Approve & publish/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Reject$/i })).toBeInTheDocument();
});

test("/dashboard renders Educator Dashboard with KPIs + recent activity", async () => {
  asAuthenticated();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({
          user: { firstName: "Anika", role: "TEACHER" },
          preferences: {},
          exams: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u.includes("/content/questions") && !u.includes("scope=all")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "q-d",
              topicId: "t-1",
              stem: "What is Newton's second law?",
              choices: ["F=ma", "E=mc²", "PV=nRT", "v=u+at"],
              correctIdx: 0,
              difficultyB: 0,
              discriminationA: 1,
              guessingC: 0,
              language: "en",
              status: "DRAFT",
              createdBy: "u-1",
              createdAt: new Date().toISOString(),
            },
            {
              id: "q-p",
              topicId: "t-1",
              stem: "Define entropy.",
              choices: ["Disorder", "Energy", "Force", "Mass"],
              correctIdx: 0,
              difficultyB: 0.4,
              discriminationA: 1,
              guessingC: 0,
              language: "en",
              status: "PUBLISHED",
              createdBy: "u-1",
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/dashboard");
  // Hero greeting carries the user name
  expect((await screen.findAllByText(/Anika/)).length).toBeGreaterThanOrEqual(1);
  // KPI labels (Drafts is unique; Published leaks across KPI + row pill)
  expect(screen.getByText(/^Drafts$/i)).toBeInTheDocument();
  expect(screen.getAllByText(/^Published$/i).length).toBeGreaterThanOrEqual(1);
  // In-flight + Published section headings
  expect(screen.getByRole("heading", { name: /In flight/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Recently published/i })).toBeInTheDocument();
  // Quick actions section
  expect(screen.getByRole("heading", { name: /Quick actions/i })).toBeInTheDocument();
});

test("/ on web-portal redirects to /dashboard when authenticated", async () => {
  asAuthenticated();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({
          user: { firstName: "Anika", role: "TEACHER" },
          preferences: {},
          exams: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u.includes("/content/questions")) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/");
  // Lands on Dashboard
  expect((await screen.findAllByText(/Anika/)).length).toBeGreaterThanOrEqual(1);
});
