import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../api", () => ({
  auth: { fetch: vi.fn() },
}));
vi.mock("../env", () => ({ env: { apiBaseUrl: "http://api" } }));

import { auth } from "../api";
import { batches, languages } from "../translation-workbench-api";

const mockFetch = auth.fetch as unknown as ReturnType<typeof vi.fn>;

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => mockFetch.mockReset());

describe("translation-workbench-api", () => {
  it("languages.list hits the right URL", async () => {
    mockFetch.mockResolvedValueOnce(ok({ languages: [{ code: "hi" }] }));
    const out = await languages.list();
    expect(mockFetch).toHaveBeenCalledWith("http://api/localisation/languages?includeDisabled=false");
    expect(out[0].code).toBe("hi");
  });

  it("batches.create posts body and returns id", async () => {
    mockFetch.mockResolvedValueOnce(ok({ batchId: "b1", totalTasks: 2, skipped: 0 }));
    const out = await batches.create({ questionIds: ["q1"], targetLangs: ["hi", "ta"] });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body).targetLangs).toEqual(["hi", "ta"]);
    expect(out.batchId).toBe("b1");
  });

  it("throws on non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    await expect(languages.list()).rejects.toThrow();
  });
});
