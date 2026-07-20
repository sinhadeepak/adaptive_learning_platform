import { describe, expect, it } from "vitest";
import { EMPTY_DOC, collectObjectKeys, stripTransientSrc } from "./noteDoc";

const doc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "hi" }] },
    { type: "image", attrs: { objectKey: "note-images/u/a.png", src: "http://signed/a" } },
    { type: "image", attrs: { objectKey: "note-images/u/b.png", src: "http://signed/b" } },
    { type: "image", attrs: { objectKey: "note-images/u/a.png", src: "http://signed/a2" } },
  ],
};

describe("noteDoc", () => {
  it("EMPTY_DOC is a single empty paragraph", () => {
    expect(EMPTY_DOC).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("stripTransientSrc removes src but keeps objectKey, without mutating input", () => {
    const out = stripTransientSrc(doc);
    const imgs = out.content!.filter((n) => n.type === "image");
    expect(imgs.every((n) => n.attrs!.src === undefined)).toBe(true);
    expect(imgs[0].attrs!.objectKey).toBe("note-images/u/a.png");
    // input untouched
    expect((doc.content[1] as { attrs: { src?: string } }).attrs.src).toBe("http://signed/a");
  });

  it("collectObjectKeys dedupes in document order", () => {
    expect(collectObjectKeys(doc)).toEqual(["note-images/u/a.png", "note-images/u/b.png"]);
  });

  it("handles docs without content", () => {
    expect(collectObjectKeys({ type: "doc" })).toEqual([]);
    expect(stripTransientSrc({ type: "doc" })).toEqual({ type: "doc" });
  });
});
