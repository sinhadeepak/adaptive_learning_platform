// Phase 3.1 — Mistake Notebook client + types.
//
// Backs pages/MistakeNotebook.tsx: lists captured wrong answers, drives the
// spaced-repetition replay (shared canonical SM-2, graded 0..5), and reuses
// the error-tag helpers from the error-pattern panel.

import { auth } from "./api";
import type { ErrorTag } from "./error_patterns";

export interface Mistake {
  id: string;
  questionId: string | null;
  topicId: string;
  topicTitle?: string;
  examId: string | null;
  errorTag: ErrorTag | null;
  stem: string | null;
  chosenText: string | null;
  correctText: string | null;
  explanation: string | null;
  createdAt: string | null;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  dueAt: string | null;
  overdueDays: number;
}

export interface MistakeListResp {
  userId: string;
  items: Mistake[];
}

export interface MistakeDueResp {
  userId: string;
  now: string;
  dueCount: number;
  items: Mistake[];
}

export interface MistakeReviewResult {
  mistakeId: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  dueAt: string;
}

const BASE = "/api/v1/analytics/mistakes";

export const mistakes = {
  async list(
    userId: string,
    opts?: { topicId?: string; errorTag?: ErrorTag; limit?: number; offset?: number },
  ): Promise<Mistake[]> {
    const p = new URLSearchParams();
    if (opts?.topicId) p.set("topic_id", opts.topicId);
    if (opts?.errorTag) p.set("error_tag", opts.errorTag);
    if (opts?.limit) p.set("limit", String(opts.limit));
    if (opts?.offset) p.set("offset", String(opts.offset));
    const qs = p.toString();
    const r = await auth.fetch(`${BASE}/${userId}${qs ? `?${qs}` : ""}`);
    if (!r.ok) throw new Error("Could not load your mistake notebook.");
    return ((await r.json()) as MistakeListResp).items;
  },

  async due(userId: string, limit = 20): Promise<MistakeDueResp> {
    const r = await auth.fetch(`${BASE}/${userId}/due?limit=${limit}`);
    if (!r.ok) throw new Error("Could not load due mistakes.");
    return (await r.json()) as MistakeDueResp;
  },

  async review(
    userId: string,
    mistakeId: string,
    quality: number,
  ): Promise<MistakeReviewResult> {
    const r = await auth.fetch(`${BASE}/${userId}/review/${mistakeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality }),
    });
    if (!r.ok) throw new Error("Could not save your review.");
    return (await r.json()) as MistakeReviewResult;
  },
};

/** How confident the learner felt → SM-2 quality grade (0..5). Three buttons
 * keep the review flow simple while still driving the scheduler meaningfully. */
export const REVIEW_GRADES: { label: string; quality: number; hint: string }[] = [
  { label: "Still wrong", quality: 1, hint: "Show again soon" },
  { label: "Got it, unsure", quality: 3, hint: "Review again in a bit" },
  { label: "Nailed it", quality: 5, hint: "Space it out" },
];
