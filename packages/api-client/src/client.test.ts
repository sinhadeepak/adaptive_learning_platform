import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, type AuthAdapter } from "./client";

const BASE = "https://api.example/v1";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockAuth(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): AuthAdapter {
  return { fetch: fetchImpl };
}

describe("api-client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("GET returns parsed JSON body on 200", async () => {
    const fn = vi.fn().mockResolvedValue(jsonResponse(200, { hello: "world" }));
    const api = createApiClient({ baseUrl: BASE, auth: mockAuth(fn) });

    const result = await api.get<{ hello: string }>("/ping");
    expect(result.hello).toBe("world");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("returns undefined on 204", async () => {
    const fn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const api = createApiClient({ baseUrl: BASE, auth: mockAuth(fn) });
    const r = await api.delete("/profile/avatar");
    expect(r).toBeUndefined();
  });

  it("throws ApiError with status + payload on 4xx", async () => {
    const fn = vi.fn().mockResolvedValue(jsonResponse(400, { code: "bad_input", fields: ["email"] }));
    const api = createApiClient({ baseUrl: BASE, auth: mockAuth(fn) });

    const promise = api.post("/profile", { email: "x" });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 400,
      path: "/profile",
      payload: { code: "bad_input", fields: ["email"] },
    });
  });

  it("retries GET on 500 with exponential backoff", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const api = createApiClient({ baseUrl: BASE, auth: mockAuth(fn), retries: 2 });
    const p = api.get("/flaky");
    // advance through the two backoffs
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry POST on 500", async () => {
    const fn = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const api = createApiClient({ baseUrl: BASE, auth: mockAuth(fn), retries: 2 });

    await expect(api.post("/do", {})).rejects.toBeInstanceOf(ApiError);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("sends x-trace-id header", async () => {
    const fn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const api = createApiClient({ baseUrl: BASE, auth: mockAuth(fn) });

    await api.get("/trace");
    const headers = fn.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("x-trace-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("fires onError callback for API errors", async () => {
    const onError = vi.fn();
    const fn = vi.fn().mockResolvedValue(jsonResponse(404, { error: "not found" }));
    const api = createApiClient({ baseUrl: BASE, auth: mockAuth(fn), onError });

    await expect(api.get("/missing")).rejects.toBeInstanceOf(ApiError);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ status: 404, path: "/missing" });
  });
});
