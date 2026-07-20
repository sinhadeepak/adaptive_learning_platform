// Per-exam student notebook client. Mirrors lib/notes-api.ts conventions.
import { auth } from "./api";
import { env } from "./env";

export interface NoteSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface Note {
  id: string;
  exam_id: string;
  title: string;
  body: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const base = `${env.apiBaseUrl}/content/notes`;

async function ok<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (b?.detail?.message) msg = b.detail.message;
      else if (typeof b?.detail === "string") msg = b.detail;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const userNotes = {
  async list(examId: string): Promise<NoteSummary[]> {
    return ok<NoteSummary[]>(
      await auth.fetch(`${base}?exam_id=${encodeURIComponent(examId)}`),
    );
  },
  async create(examId: string, title?: string): Promise<Note> {
    return ok<Note>(
      await auth.fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(title ? { exam_id: examId, title } : { exam_id: examId }),
      }),
    );
  },
  async get(id: string): Promise<Note> {
    return ok<Note>(await auth.fetch(`${base}/${encodeURIComponent(id)}`));
  },
  async update(
    id: string,
    patch: { title?: string; body?: Record<string, unknown> },
  ): Promise<Note> {
    return ok<Note>(
      await auth.fetch(`${base}/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
  },
  async remove(id: string): Promise<void> {
    const res = await auth.fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  },
};
