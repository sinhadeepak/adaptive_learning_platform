// Pasted-image upload for notes — reuses the platform presign → MinIO → sign flow.
import { auth } from "./api";
import { env } from "./env";

interface PresignResponse {
  url: string;
  object_key: string;
  max_bytes: number;
  method: string;
  content_type: string;
  upload_claim: string;
}

/** Presign a note-image, PUT the bytes to MinIO, return the stable object key. */
export async function uploadNoteImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be pasted into a note.");
  }
  const presignRes = await auth.fetch(`${env.apiBaseUrl}/uploads/presign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "note-image", content_type: file.type }),
  });
  if (!presignRes.ok) throw new Error(`Couldn't prepare upload (HTTP ${presignRes.status})`);
  const presign = (await presignRes.json()) as PresignResponse;

  if (file.size > presign.max_bytes) {
    throw new Error(
      `Image is too large (max ${Math.round(presign.max_bytes / (1024 * 1024))} MB).`,
    );
  }

  const put = await fetch(presign.url, {
    method: "PUT",
    headers: { "Content-Type": presign.content_type },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);
  return presign.object_key;
}

/** Mint a short-lived signed GET URL for a stored note-image object key. */
export async function signObjectKey(objectKey: string): Promise<string> {
  const res = await auth.fetch(
    `${env.apiBaseUrl}/uploads/sign?key=${encodeURIComponent(objectKey)}`,
  );
  if (!res.ok) throw new Error(`Couldn't load image (HTTP ${res.status})`);
  return ((await res.json()) as { url: string }).url;
}
