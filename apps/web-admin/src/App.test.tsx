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
  // asAuthenticated() mutates the auth singleton's getUser/isAuthenticated
  // via Object.assign; restoreAllMocks() doesn't undo that. Reset to the
  // unauthenticated defaults so the next test starts clean.
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
    id: "u-admin",
    email: "admin@alp.dev",
    firstName: "Ops",
    lastName: "Admin",
    role: "PLATFORM_ADMIN",
    ...user,
  };
  Object.assign(auth, { getUser: () => u, isAuthenticated: () => true });
  return u;
}

test("admin login renders email + password fields", () => {
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
  expect(screen.getByText(/Restricted to institution and platform admins/i)).toBeInTheDocument();
});

test("/ redirects to /login when not authenticated", () => {
  renderAt("/");
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("/flags without auth redirects to /login", () => {
  renderAt("/flags");
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("/flags with non-admin role shows access-denied screen", async () => {
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
  renderAt("/flags");
  expect(await screen.findByRole("heading", { name: /Access denied/i })).toBeInTheDocument();
});

test("/flags renders empty-state when no flags are registered", async () => {
  asAuthenticated();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Ops", role: "PLATFORM_ADMIN" }, preferences: {}, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/flags")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/flags");
  expect(await screen.findByText(/No flags registered yet/i)).toBeInTheDocument();
});

test("/flags renders the data-table with flag rows + DANGER tag", async () => {
  asAuthenticated();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Ops", role: "PLATFORM_ADMIN" }, preferences: {}, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/flags")) {
      return new Response(
        JSON.stringify([
          {
            name: "search.opensearch_v2",
            description: "Use the v2 topics index",
            defaultValue: true,
            dangerCritical: false,
            owner: "search-team",
            blastRadius: "tenant",
            overrideCount: 2,
            updatedAt: new Date().toISOString(),
          },
          {
            name: "billing.stripe_kill",
            description: "Disable Stripe checkout (incident)",
            defaultValue: false,
            dangerCritical: true,
            owner: "billing-oncall",
            blastRadius: "global",
            overrideCount: 0,
            updatedAt: new Date().toISOString(),
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/flags");
  expect(await screen.findByText("search.opensearch_v2")).toBeInTheDocument();
  expect(screen.getByText("billing.stripe_kill")).toBeInTheDocument();
  // BoolPill: ON for the v2 default, OFF for the kill switch
  const onPills = screen.getAllByText("ON");
  const offPills = screen.getAllByText("OFF");
  expect(onPills.length).toBeGreaterThanOrEqual(1);
  expect(offPills.length).toBeGreaterThanOrEqual(1);
  // DANGER tag on the kill switch
  expect(screen.getByText(/⚠ DANGER$/)).toBeInTheDocument();
});

test("/flags/:name renders flag detail with default + overrides + audit-log sections", async () => {
  asAuthenticated();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/profile/me")) {
      return new Response(
        JSON.stringify({ user: { firstName: "Ops", role: "PLATFORM_ADMIN" }, preferences: {}, exams: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/flags/search.opensearch_v2")) {
      return new Response(
        JSON.stringify({
          name: "search.opensearch_v2",
          description: "Use the v2 topics index",
          defaultValue: true,
          dangerCritical: false,
          owner: "search-team",
          blastRadius: "tenant",
          overrideCount: 1,
          updatedAt: new Date().toISOString(),
          overrides: [
            {
              tenantId: "11111111-1111-1111-1111-111111111111",
              value: false,
              setByUserId: "u-ops",
              setAt: new Date().toISOString(),
            },
          ],
          audit: [
            {
              ts: new Date().toISOString(),
              flagName: "search.opensearch_v2",
              scope: "platform",
              tenantId: null,
              oldValue: false,
              newValue: true,
              actorUserId: "u-ops",
              rationale: "Promote v2 to default",
            },
            {
              ts: new Date().toISOString(),
              flagName: "search.opensearch_v2",
              scope: "tenant",
              tenantId: "11111111-1111-1111-1111-111111111111",
              oldValue: true,
              newValue: false,
              actorUserId: "u-ops",
              rationale: "Tenant rollback",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  });
  renderAt("/flags/search.opensearch_v2");
  // Section headings
  expect(await screen.findByRole("heading", { name: /^Default$/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Tenant overrides/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Audit log/i })).toBeInTheDocument();
  // Audit log shows scope chips: one global, one tenant. (FlagDetail
  // accepts both legacy lowercase "platform"/"tenant" and the real backend
  // uppercase "GLOBAL"/"TENANT" — see PR #55. The chip ALWAYS renders the
  // normalised lowercase label.)
  expect(screen.getByText(/^global$/i)).toBeInTheDocument();
  expect(screen.getAllByText(/^tenant$/i).length).toBeGreaterThanOrEqual(1);
  // Override-add fieldset has tenant/value/rationale inputs
  expect(screen.getByLabelText(/Tenant UUID/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Rationale/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Save override/i })).toBeInTheDocument();
});

test("/audit renders global audit table with scope filter chips", async () => {
  asAuthenticated();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/profile/me")) {
        return new Response(
          JSON.stringify({
            user: { firstName: "Ops", role: "PLATFORM_ADMIN" },
            preferences: {},
            exams: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/flags/audit")) {
        return new Response(
          JSON.stringify([
            {
              ts: new Date().toISOString(),
              flagName: "irt_model_enabled",
              scope: "GLOBAL",
              tenantId: null,
              oldValue: false,
              newValue: true,
              actorUserId: "u-ops",
              rationale: "Promote ML run",
            },
            {
              ts: new Date().toISOString(),
              flagName: "checkout_enabled",
              scope: "TENANT",
              tenantId: "11111111-1111-1111-1111-111111111111",
              oldValue: true,
              newValue: false,
              actorUserId: "u-ops",
              rationale: "Tenant rollback",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  renderAt("/audit");
  // Both flag names render as deep-links.
  expect(await screen.findByText("irt_model_enabled")).toBeInTheDocument();
  expect(screen.getByText("checkout_enabled")).toBeInTheDocument();
  // Scope filter tabs.
  expect(screen.getByRole("tab", { name: /^All$/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /global only/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /tenant only/i })).toBeInTheDocument();
  // Both scope chips present (one global, one tenant).
  expect(screen.getByText(/^global$/i)).toBeInTheDocument();
  expect(screen.getByText(/^tenant$/i)).toBeInTheDocument();
});

test("/audit without auth redirects to /login", () => {
  renderAt("/audit");
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("/audit with non-admin role shows access-denied", async () => {
  asAuthenticated({ role: "TEACHER" });
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/v1/profile/me")) {
        return new Response(
          JSON.stringify({
            user: { firstName: "T", role: "TEACHER" },
            preferences: {},
            exams: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  renderAt("/audit");
  expect(await screen.findByRole("heading", { name: /Access denied/i }))
    .toBeInTheDocument();
});
