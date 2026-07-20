/**
 * Phase 5 web-portal endpoints.
 *
 * Wraps:
 *   GET  /content/types
 *   GET  /content/types/{id}/payload-schema
 *   GET  /content/types/{id}/translatable-fields
 *   GET  /content/exams/{exam_id}/supported-types
 *   POST /content/ai/draft
 *   POST /content/ai/explanation
 *   POST /content/ai/distractors
 *   POST /content/ai/quality-check
 *   POST /content/ai/edit-distance
 *   POST /content/questions/{id}/translations/{lang}/request
 */

import { auth } from "./api";
import { env } from "./env";

// ── Types registry ─────────────────────────────────────────────────────────

export interface TypeMeta {
  type_id: string;
  family: string;
  evaluation_mode: "DETERMINISTIC" | "AI_ASSISTED" | "HYBRID" | "HUMAN";
  supports_partial: boolean;
  media_kinds: string[];
}

export const types = {
  async list(): Promise<TypeMeta[]> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/types`);
    if (!res.ok) throw new Error(`types list failed: ${res.status}`);
    return res.json();
  },
  async forExam(examId: string): Promise<TypeMeta[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/exams/${encodeURIComponent(examId)}/supported-types`,
    );
    if (!res.ok) throw new Error(`supported types failed: ${res.status}`);
    const body = await res.json();
    return body.types;
  },
  async payloadSchema(typeId: string): Promise<Record<string, unknown>> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/types/${encodeURIComponent(typeId)}/payload-schema`,
    );
    if (!res.ok) throw new Error(`payload schema failed: ${res.status}`);
    const body = await res.json();
    return body.schema;
  },
  async translatableFields(typeId: string): Promise<string[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/types/${encodeURIComponent(typeId)}/translatable-fields`,
    );
    if (!res.ok) throw new Error(`translatable-fields failed: ${res.status}`);
    const body = await res.json();
    return body.fields;
  },
};

// ── AI Authoring ───────────────────────────────────────────────────────────

export interface AIDraftMarker {
  original_payload: Record<string, unknown>;
  prompt_template_id: string;
  prompt_template_version: string;
  model: string;
  created_at: string;
  author_edited: boolean;
  edit_distance: Record<string, number>;
}

export const aiAuthoring = {
  async draft(
    typeId: string,
    topic: string,
    difficulty: "EASY" | "MEDIUM" | "HARD",
    exam: string,
    syllabusChapter?: string,
    sourceMaterial?: string,
  ): Promise<{ draft: Record<string, unknown>; marker: AIDraftMarker }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/ai/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type_id: typeId,
        topic,
        difficulty,
        exam,
        syllabus_chapter: syllabusChapter,
        source_material: sourceMaterial,
      }),
    });
    if (!res.ok) throw new Error(`AI draft failed: ${res.status}`);
    return res.json();
  },
  async bulkDraft(input: {
    typeId: string;
    topic: string;
    count: number;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    exam: string;
    syllabusChapter?: string;
    sourceMaterial?: string;
  }): Promise<{
    items: {
      index: number;
      draft: Record<string, unknown> | null;
      marker: AIDraftMarker | null;
      error: string | null;
    }[];
    requested: number;
    succeeded: number;
  }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/ai/bulk-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type_id: input.typeId,
        topic: input.topic,
        count: input.count,
        difficulty: input.difficulty,
        exam: input.exam,
        syllabus_chapter: input.syllabusChapter,
        source_material: input.sourceMaterial,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Bulk draft failed: ${res.status} ${body}`);
    }
    return res.json();
  },

  // ── Async + chunked bulk generation (background job) ────────────────
  async bulkDraftJob(input: {
    typeId: string;
    topic: string;
    count: number;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    exam: string;
    syllabusChapter?: string;
    sourceMaterial?: string;
    topicId?: string;
    topicTitle?: string;
    language?: string;
  }): Promise<{ jobId: string; status: string }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/ai/bulk-draft-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type_id: input.typeId,
        topic: input.topic,
        count: input.count,
        difficulty: input.difficulty,
        exam: input.exam,
        syllabus_chapter: input.syllabusChapter,
        source_material: input.sourceMaterial,
        topic_id: input.topicId,
        topic_title: input.topicTitle,
        language: input.language,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Bulk job failed: ${res.status} ${body}`);
    }
    return res.json();
  },
  async getBulkJob(jobId: string): Promise<{
    jobId: string;
    status: "pending" | "succeeded" | "failed";
    result: {
      items: {
        index: number;
        draft: Record<string, unknown> | null;
        marker: AIDraftMarker | null;
        error: string | null;
      }[];
      requested: number;
      succeeded: number;
    } | null;
    progress: { done: number; total: number } | null;
    context: {
      topicId: string | null;
      topicTitle: string | null;
      typeId: string | null;
      exam: string | null;
      language: string | null;
      difficulty: string | null;
    } | null;
    error: string | null;
  }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/ai/bulk-draft-job/${encodeURIComponent(jobId)}`,
    );
    if (!res.ok) throw new Error(`Load bulk job failed: ${res.status}`);
    return res.json();
  },
  async listBulkJobs(): Promise<{
    jobs: {
      jobId: string;
      status: "pending" | "succeeded" | "failed";
      topic: string | null;
      count: number | null;
      progress: { done: number; total: number } | null;
      createdAt: string | null;
      completedAt: string | null;
    }[];
  }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/ai/bulk-draft-jobs`);
    if (!res.ok) throw new Error(`List bulk jobs failed: ${res.status}`);
    return res.json();
  },

  async expandExplanation(stem: string, answer: string): Promise<{ explanation: string; steps: string[] }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/ai/explanation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stem, answer }),
    });
    if (!res.ok) throw new Error(`expand explanation failed: ${res.status}`);
    return res.json();
  },
  async suggestDistractors(stem: string, correctAnswer: string, n = 3): Promise<{ distractors: string[] }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/ai/distractors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stem, correct_answer: correctAnswer, n }),
    });
    if (!res.ok) throw new Error(`suggest distractors failed: ${res.status}`);
    return res.json();
  },
  async qualityCheck(
    stem: string,
    correctId: string,
    options: Record<string, string>,
    nearestNeighbour?: [string, number],
  ): Promise<{ warnings: Array<{ code: string; severity: string; message: string; field?: string | null; metadata?: Record<string, unknown> }> }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/ai/quality-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stem,
        correct_id: correctId,
        options,
        nearest_neighbour: nearestNeighbour,
      }),
    });
    if (!res.ok) throw new Error(`quality check failed: ${res.status}`);
    return res.json();
  },
  async editDistance(
    original: Record<string, unknown>,
    current: Record<string, unknown>,
  ): Promise<{ distances: Record<string, number> }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/ai/edit-distance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ original, current }),
    });
    if (!res.ok) throw new Error(`edit distance failed: ${res.status}`);
    return res.json();
  },
};

// ── Translation request ────────────────────────────────────────────────────

export const translationOps = {
  async requestForArtifact(
    questionId: string,
    targetLang: string,
    sourceLang = "en",
    subject = "general",
  ): Promise<{ jobId: string; artifactId: string; targetLang: string; status: string }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/questions/${encodeURIComponent(questionId)}/translations/${encodeURIComponent(targetLang)}/request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLang, subject }),
      },
    );
    if (!res.ok) throw new Error(`translation request failed: ${res.status}`);
    return res.json();
  },
};
