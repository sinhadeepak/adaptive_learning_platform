/**
 * Per-family student renderer contract (P5-S59).
 *
 * Every renderer takes a typed `payload` + a `value` (the student's
 * current response) + an `onChange` callback. The Quiz page (or any
 * caller) drives the lifecycle and decides when to submit.
 *
 * Returning `null` from `value` means the student hasn't attempted —
 * Quiz Go translates this to UNATTEMPTED on the backend.
 */

import type { ReactNode } from "react";

export interface RendererProps<TPayload, TValue> {
  payload: TPayload;
  value: TValue | null;
  onChange: (value: TValue | null) => void;
  language?: string;
  disabled?: boolean;
  // Phase 7 — context the renderer needs when it accepts file uploads
  // (CASE_STUDY, ESSAY, etc). Plumbed through QuestionRenderer +
  // Quiz.tsx so the UploadField can scope objects to the right
  // session_id/question_id prefix in MinIO.
  sessionId?: string;
  questionId?: string;
}

export type Renderer<TPayload, TValue> = (
  props: RendererProps<TPayload, TValue>,
) => ReactNode;
