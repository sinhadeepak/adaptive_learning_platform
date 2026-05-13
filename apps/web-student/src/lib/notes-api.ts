// Phase 7 (P7-A1) — per-topic student-authored notes client.

import { auth } from "./api";
import { env } from "./env";

export type NoteVisibility = "PRIVATE" | "TEACHER_VISIBLE" | "COHORT" | "PUBLIC";

export interface TopicNote {
  userId: string;
  topicId: string;
  contentMd: string;
  visibility: NoteVisibility;
  updatedAt: string;
}

export const notes = {
  async get(userId: string, topicId: string): Promise<TopicNote | null> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/topic-notes/${encodeURIComponent(userId)}/${encodeURIComponent(topicId)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async put(
    userId: string,
    topicId: string,
    body: { contentMd: string; visibility?: NoteVisibility },
  ): Promise<TopicNote> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/topic-notes/${encodeURIComponent(userId)}/${encodeURIComponent(topicId)}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const b = await res.json();
        if (b?.detail?.[0]?.msg) msg = b.detail[0].msg;
        else if (b?.detail?.message) msg = b.detail.message;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.json();
  },
  async remove(userId: string, topicId: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/topic-notes/${encodeURIComponent(userId)}/${encodeURIComponent(topicId)}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  },
};

export interface ImportanceTopicResponse {
  topicId: string;
  topicTitle: string | null;
  weight: number;
  hidden: boolean;
  source: "override" | "pyq" | "blueprint" | "uniform";
  confidence: number;
  sampleSize: number;
}

export const importance = {
  async byExam(examId: string): Promise<ImportanceTopicResponse[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/catalog/topic-importance?examId=${encodeURIComponent(examId)}`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { topics: ImportanceTopicResponse[] };
    return body.topics ?? [];
  },
};
