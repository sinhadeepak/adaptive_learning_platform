import { afterEach, describe, expect, it, vi } from "vitest";
import { signObjectKey, uploadNoteImage } from "./noteImages";
import { auth } from "./api";

afterEach(() => vi.restoreAllMocks());

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}

describe("noteImages", () => {
  it("uploadNoteImage presigns then PUTs and returns object_key", async () => {
    const authSpy = vi.spyOn(auth, "fetch").mockResolvedValue(
      jsonRes(200, {
        url: "http://minio/put", object_key: "note-images/u/abc.png",
        max_bytes: 25 * 1024 * 1024, method: "PUT", content_type: "image/png",
        upload_claim: "claim",
      }),
    );
    const putSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    const key = await uploadNoteImage(file);

    expect(key).toBe("note-images/u/abc.png");
    expect(String(authSpy.mock.calls[0][0])).toContain("/uploads/presign");
    expect(JSON.parse(String(authSpy.mock.calls[0][1]?.body))).toMatchObject({
      kind: "note-image", content_type: "image/png",
    });
    expect(putSpy).toHaveBeenCalledWith("http://minio/put", expect.objectContaining({ method: "PUT" }));
  });

  it("uploadNoteImage rejects oversize before PUT", async () => {
    vi.spyOn(auth, "fetch").mockResolvedValue(
      jsonRes(200, { url: "u", object_key: "k", max_bytes: 2, method: "PUT",
        content_type: "image/png", upload_claim: "c" }),
    );
    const putSpy = vi.spyOn(globalThis, "fetch");
    const big = new File([new Uint8Array([1, 2, 3, 4, 5])], "b.png", { type: "image/png" });
    await expect(uploadNoteImage(big)).rejects.toThrow();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it("signObjectKey returns the signed url", async () => {
    const spy = vi.spyOn(auth, "fetch").mockResolvedValue(
      jsonRes(200, { url: "http://minio/get?sig=1", expires_at: "t" }),
    );
    const url = await signObjectKey("note-images/u/abc.png");
    expect(url).toBe("http://minio/get?sig=1");
    expect(String(spy.mock.calls[0][0])).toContain("/uploads/sign?key=note-images%2Fu%2Fabc.png");
  });
});
