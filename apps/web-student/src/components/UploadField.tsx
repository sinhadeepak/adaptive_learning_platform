/**
 * UploadField — file picker + camera capture wrapped around the
 * presigned-upload control plane.
 *
 * Flow on every selected file:
 *   1. POST /api/v1/uploads/presign  → { url, objectKey, ... }
 *   2. PUT directly to MinIO via the returned url
 *   3. POST /api/v1/uploads/finalize → server verifies the bytes
 *      landed and returns final metadata
 *
 * Bytes never traverse our app servers — see docs/storage_layout.md.
 *
 * Caller passes:
 *   - `kind` and the parent ids matching `kind` (per the same doc)
 *   - `value` (existing uploaded items)
 *   - `onChange` (called after each successful upload AND after deletes)
 *
 * `accept` and `capture` control the OS file picker. On mobile,
 * `capture="environment"` opens the rear camera straight away — the
 * student can photograph their handwritten case-study answer instead
 * of typing it.
 */

import { useRef, useState } from "react";
import { auth } from "../lib/api";

export interface UploadedFile {
  objectKey: string;
  contentType: string;
  size: number;
  originalName: string | null;
}

export interface UploadKind {
  kind:
    | "quiz-response"
    | "doubt"
    | "content-media"
    | "profile-avatar"
    | "profile-id-proof"
    | "tmp";
  sessionId?: string;
  questionId?: string;
  subQuestionId?: string;
  doubtId?: string;
}

interface PresignResponse {
  url: string;
  object_key: string;
  expires_at: string;
  max_bytes: number;
  method: string;
  content_type: string;
}

interface FinalizeResponse {
  object_key: string;
  size: number;
  content_type: string | null;
  original_name: string | null;
  etag: string;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

interface Props {
  kind: UploadKind;
  value: UploadedFile[];
  onChange: (next: UploadedFile[]) => void;
  disabled?: boolean;
  // Caps the upload count per field so a single sub-question doesn't
  // accumulate dozens of stale photos. Caller defaults to 5.
  maxFiles?: number;
}

export function UploadField({
  kind,
  value,
  onChange,
  disabled,
  maxFiles = 5,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadOne(file: File): Promise<UploadedFile | null> {
    // Step 1 — presign.
    const presignBody = {
      kind: kind.kind,
      content_type: file.type || "application/octet-stream",
      original_name: file.name,
      session_id: kind.sessionId,
      question_id: kind.questionId,
      sub_question_id: kind.subQuestionId,
      doubt_id: kind.doubtId,
    };
    const presignRes = await auth.fetch("/api/v1/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(presignBody),
    });
    if (!presignRes.ok) {
      const detail = await safeDetail(presignRes);
      throw new Error(detail || `Presign failed: HTTP ${presignRes.status}`);
    }
    const presign = (await presignRes.json()) as PresignResponse;
    if (file.size > presign.max_bytes) {
      throw new Error(
        `File is ${formatBytes(file.size)}; cap is ${formatBytes(presign.max_bytes)}.`,
      );
    }

    // Step 2 — direct PUT to MinIO. ContentType must match exactly,
    // boto3 signed it into the policy.
    const putRes = await fetch(presign.url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": presign.content_type },
    });
    if (!putRes.ok) {
      throw new Error(`Upload failed: HTTP ${putRes.status}`);
    }

    // Step 3 — server verifies the object is in place + records metadata.
    const finalRes = await auth.fetch("/api/v1/uploads/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object_key: presign.object_key }),
    });
    if (!finalRes.ok) {
      const detail = await safeDetail(finalRes);
      throw new Error(detail || `Finalize failed: HTTP ${finalRes.status}`);
    }
    const final = (await finalRes.json()) as FinalizeResponse;
    return {
      objectKey: final.object_key,
      contentType: final.content_type ?? file.type,
      size: final.size,
      originalName: final.original_name ?? file.name,
    };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const remaining = maxFiles - value.length;
      const slice = Array.from(files).slice(0, remaining);
      const uploaded: UploadedFile[] = [];
      for (const f of slice) {
        const u = await uploadOne(f);
        if (u) uploaded.push(u);
      }
      onChange([...value, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  const atCap = value.length >= maxFiles;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: "none" }}
        disabled={disabled || busy || atCap}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        // capture="environment" hints to mobile browsers to open the
        // rear camera. Desktop browsers ignore this and fall back to
        // the regular file picker, which is the right behavior.
        capture="environment"
        style={{ display: "none" }}
        disabled={disabled || busy || atCap}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || busy || atCap}
          style={btnStyle(disabled || busy || atCap)}
        >
          📎 {busy ? "Uploading…" : "Attach file"}
        </button>
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled || busy || atCap}
          style={btnStyle(disabled || busy || atCap)}
        >
          📷 Take photo
        </button>
        <span style={{ alignSelf: "center", fontSize: 11, color: "var(--text-muted)" }}>
          {value.length}/{maxFiles} attached · jpg/png/webp/heic/pdf · 25 MB max each
        </span>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--color-red)",
          }}
        >
          {error}
        </div>
      )}

      {value.length > 0 && (
        <ul
          style={{
            marginTop: 8,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {value.map((f, i) => (
            <li
              key={f.objectKey}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                background: "var(--bg-surface3)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <span aria-hidden style={{ fontSize: 13 }}>
                {f.contentType.startsWith("image/") ? "🖼️" : "📄"}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text-primary)",
                }}
                title={f.originalName ?? f.objectKey}
              >
                {f.originalName ?? f.objectKey.split("/").pop()}
              </span>
              <span style={{ color: "var(--text-muted)" }}>{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled || busy}
                aria-label={`Remove ${f.originalName ?? "file"}`}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function btnStyle(disabled?: boolean): React.CSSProperties {
  return {
    background: disabled ? "var(--bg-surface2)" : "var(--bg-surface3)",
    color: disabled ? "var(--text-faint)" : "var(--text-primary)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function safeDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: { message?: string } | string };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail && typeof body.detail === "object" && body.detail.message)
      return body.detail.message;
  } catch {
    /* not json */
  }
  return null;
}
