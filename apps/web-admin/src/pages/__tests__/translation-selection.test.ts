import { describe, expect, it } from "vitest";
import { clearPage, resolveAllMatching, selectAllOnPage, toggle } from "../translation-selection";

describe("translation-selection", () => {
  it("toggles an id in/out", () => {
    let s = new Set<string>();
    s = toggle(s, "a");
    expect(s.has("a")).toBe(true);
    s = toggle(s, "a");
    expect(s.has("a")).toBe(false);
  });

  it("selectAllOnPage adds, clearPage removes", () => {
    let s = new Set<string>(["x"]);
    s = selectAllOnPage(s, ["a", "b"]);
    expect([...s].sort()).toEqual(["a", "b", "x"]);
    s = clearPage(s, ["a", "b"]);
    expect([...s]).toEqual(["x"]);
  });

  it("resolveAllMatching pages until total, respects cap", async () => {
    const all = Array.from({ length: 120 }, (_, i) => `q${i}`);
    const fetchPage = async (offset: number) => ({
      ids: all.slice(offset, offset + 50),
      total: all.length,
    });
    const out = await resolveAllMatching(fetchPage, 100);
    expect(out.ids.length).toBe(100);
    expect(out.capped).toBe(true);
  });
});
