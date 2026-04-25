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

test("/onboarding/exam without auth redirects to /login", () => {
  renderAt("/onboarding/exam");
  expect(screen.getByRole("heading", { name: /log in/i })).toBeInTheDocument();
});

test("/home renders greeting when authenticated + onboarded", () => {
  asAuthenticated({ firstName: "Rahul", onboardingState: "ONBOARDED" });
  renderAt("/home");
  expect(screen.getByRole("heading", { name: /Rahul/ })).toBeInTheDocument();
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

test("/catalog/topic/:id renders topic detail with disabled quiz CTA", async () => {
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
  const quizBtn = screen.getByRole("button", { name: /start practice quiz/i });
  expect(quizBtn).toBeDisabled();
});

test("/search renders the search input", () => {
  asAuthenticated({ onboardingState: "ONBOARDED" });
  renderAt("/search");
  expect(screen.getByRole("searchbox")).toBeInTheDocument();
});
