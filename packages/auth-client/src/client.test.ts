import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "./client";
import { createMemoryTokenStorage } from "./storage";
import { AuthError } from "./types";

const BASE = "https://api.example/v1";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("auth-client", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores tokens on successful login", async () => {
    const session = {
      user: { id: "u1", email: "a@b", firstName: "A", lastName: "B", role: "STUDENT", onboardingState: "ONBOARDED" },
      tokens: { accessToken: "at", refreshToken: "rt", expiresAt: Date.now() + 60_000 },
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(200, session));
    const storage = createMemoryTokenStorage();
    const auth = createAuthClient({ baseUrl: BASE, storage });

    const result = await auth.login({ email: "a@b", password: "x" });

    expect(result.user.id).toBe("u1");
    expect(storage.get()?.accessToken).toBe("at");
    expect(auth.isAuthenticated()).toBe(true);
  });

  it("maps 401 login to AuthError invalid_credentials", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(401, { error: "bad" }));
    const auth = createAuthClient({ baseUrl: BASE, storage: createMemoryTokenStorage() });

    await expect(auth.login({ email: "a@b", password: "x" })).rejects.toMatchObject({
      name: "AuthError",
      code: "invalid_credentials",
      status: 401,
    });
  });

  it("maps 423 to locked and 429 to rate_limited", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("locked", { status: 423 }))
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }));

    const auth = createAuthClient({ baseUrl: BASE, storage: createMemoryTokenStorage() });

    await expect(auth.login({ email: "x", password: "y" })).rejects.toMatchObject({ code: "locked" });
    await expect(auth.login({ email: "x", password: "y" })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("fetch() refreshes tokens on 401 and retries once", async () => {
    const storage = createMemoryTokenStorage();
    storage.set({ accessToken: "old-at", refreshToken: "rt1", expiresAt: 0 });
    const auth = createAuthClient({ baseUrl: BASE, storage });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    // first call -> 401, triggers refresh -> 200 tokens, then retry -> 200 ok
    fetchMock
      .mockResolvedValueOnce(new Response("unauth", { status: 401 }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "new-at", refreshToken: "rt2", expiresAt: Date.now() + 60_000 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await auth.fetch(`${BASE}/profile`);
    expect(res.status).toBe(200);
    expect(storage.get()?.accessToken).toBe("new-at");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("concurrent 401s share a single refresh in-flight", async () => {
    const storage = createMemoryTokenStorage();
    storage.set({ accessToken: "old", refreshToken: "rt", expiresAt: 0 });
    const auth = createAuthClient({ baseUrl: BASE, storage });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    let refreshCalls = 0;
    let profileCalls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("/auth/refresh")) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return jsonResponse(200, { accessToken: "fresh", refreshToken: "rt2", expiresAt: Date.now() + 60_000 });
      }
      profileCalls++;
      // First 3 /profile calls (initial attempts) get 401; subsequent 3 (retries) get 200.
      return profileCalls <= 3 ? new Response("unauth", { status: 401 }) : jsonResponse(200, { ok: true });
    });

    const [r1, r2, r3] = await Promise.all([
      auth.fetch(`${BASE}/profile`),
      auth.fetch(`${BASE}/profile`),
      auth.fetch(`${BASE}/profile`),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(refreshCalls).toBe(1);
  });

  it("failed refresh clears storage and calls onSessionExpired", async () => {
    const storage = createMemoryTokenStorage();
    storage.set({ accessToken: "at", refreshToken: "rt", expiresAt: 0 });
    const onSessionExpired = vi.fn();
    const auth = createAuthClient({ baseUrl: BASE, storage, onSessionExpired });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response("unauth", { status: 401 }))
      .mockResolvedValueOnce(new Response("refresh-dead", { status: 401 }));

    await expect(auth.fetch(`${BASE}/profile`)).rejects.toBeInstanceOf(AuthError);
    expect(storage.get()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("logout clears storage even if server logout fails", async () => {
    const storage = createMemoryTokenStorage();
    storage.set({ accessToken: "at", refreshToken: "rt", expiresAt: Date.now() + 60_000 });
    const auth = createAuthClient({ baseUrl: BASE, storage });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));

    await auth.logout();
    expect(storage.get()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });
});
