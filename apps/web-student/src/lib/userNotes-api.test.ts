import { afterEach, describe, expect, it, vi } from "vitest";
import { userNotes } from "./userNotes-api";
import { auth } from "./api";

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(auth, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("userNotes api", () => {
  it("list() GETs the exam-scoped collection", async () => {
    const spy = mockFetch(200, [{ id: "n1", title: "A", updated_at: "t" }]);
    const out = await userNotes.list("exam-1");
    expect(spy.mock.calls[0][0]).toContain("/content/notes?exam_id=exam-1");
    expect(out[0].id).toBe("n1");
  });

  it("create() POSTs exam_id + title", async () => {
    const spy = mockFetch(201, { id: "n2", exam_id: "exam-1", title: "T", body: {},
      created_at: "c", updated_at: "u" });
    const out = await userNotes.create("exam-1", "T");
    const [, init] = spy.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ exam_id: "exam-1", title: "T" });
    expect(out.id).toBe("n2");
  });

  it("update() PUTs title/body", async () => {
    const spy = mockFetch(200, { id: "n2", exam_id: "e", title: "R", body: { type: "doc" },
      created_at: "c", updated_at: "u" });
    await userNotes.update("n2", { title: "R", body: { type: "doc" } });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain("/content/notes/n2");
    expect(init?.method).toBe("PUT");
  });

  it("remove() DELETEs and tolerates 204", async () => {
    const spy = vi.spyOn(auth, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await expect(userNotes.remove("n2")).resolves.toBeUndefined();
    expect(spy.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("throws on non-ok", async () => {
    mockFetch(500, { detail: "boom" });
    await expect(userNotes.list("e")).rejects.toThrow();
  });
});
