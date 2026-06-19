import { auth } from "./api";
import { env } from "./env";

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  script: string | null;
  enabled: boolean;
  isSource: boolean;
  sortOrder: number;
}

export interface BatchSummary {
  id: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "DONE_WITH_ERRORS";
  totalTasks: number;
  doneTasks: number;
  failedTasks: number;
  targetLangs: string[];
  subject: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface BatchTask {
  id: string;
  questionId: string;
  language: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  error: string | null;
  version: number | null;
  stem: string | null;
}

export interface BatchDetail {
  batch: BatchSummary;
  tasks: BatchTask[];
}

export interface ReviewItem {
  questionId: string;
  language: string;
  status: string;
  aiConfidence: number | null;
  version: number;
  culturalFlags: string[];
  stem: string;
  sourcePayload: Record<string, unknown>;
  payloadTranslation: Record<string, unknown>;
  translatablePaths: string[];
}

const base = () => env.apiBaseUrl;

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const languages = {
  async list(includeDisabled = false): Promise<Language[]> {
    const res = await auth.fetch(`${base()}/localisation/languages?includeDisabled=${includeDisabled}`);
    const body = await jsonOrThrow<{ languages: Language[] }>(res, "languages.list");
    return body.languages;
  },
  async upsert(input: Omit<Language, "isSource">): Promise<Language> {
    const res = await auth.fetch(`${base()}/localisation/languages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return jsonOrThrow<Language>(res, "languages.upsert");
  },
  async patch(code: string, patch: { enabled?: boolean; sortOrder?: number }): Promise<Language> {
    const res = await auth.fetch(`${base()}/localisation/languages/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return jsonOrThrow<Language>(res, "languages.patch");
  },
};

export interface CreateBatchInput {
  questionIds: string[];
  targetLangs: string[];
  subject?: string;
  overwriteExisting?: boolean;
}

export const batches = {
  async create(input: CreateBatchInput): Promise<{ batchId: string; totalTasks: number; skipped: number }> {
    const res = await auth.fetch(`${base()}/localisation/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return jsonOrThrow(res, "batches.create");
  },
  async get(id: string): Promise<BatchDetail> {
    const res = await auth.fetch(`${base()}/localisation/batches/${encodeURIComponent(id)}`);
    return jsonOrThrow<BatchDetail>(res, "batches.get");
  },
  async list(limit = 20, offset = 0): Promise<BatchSummary[]> {
    const res = await auth.fetch(`${base()}/localisation/batches?limit=${limit}&offset=${offset}`);
    const body = await jsonOrThrow<{ batches: BatchSummary[] }>(res, "batches.list");
    return body.batches;
  },
  async retryTask(batchId: string, taskId: string): Promise<{ retried: boolean }> {
    const res = await auth.fetch(
      `${base()}/localisation/batches/${encodeURIComponent(batchId)}/tasks/${encodeURIComponent(taskId)}/retry`,
      { method: "POST" });
    return jsonOrThrow(res, "batches.retryTask");
  },
};

export interface ReviewQueueParams {
  lang?: string;
  status?: string;
  batchId?: string;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface BulkDecision {
  questionId: string;
  lang: string;
  action: "approve" | "reject";
  rejectionReason?: string;
}

export const reviewQueue = {
  async list(params: ReviewQueueParams): Promise<{ items: ReviewItem[]; total: number }> {
    const q = new URLSearchParams();
    if (params.lang) q.set("lang", params.lang);
    q.set("status", params.status ?? "DRAFT");
    if (params.batchId) q.set("batchId", params.batchId);
    if (params.minConfidence != null) q.set("minConfidence", String(params.minConfidence));
    q.set("limit", String(params.limit ?? 50));
    q.set("offset", String(params.offset ?? 0));
    const res = await auth.fetch(`${base()}/localisation/review-queue?${q.toString()}`);
    return jsonOrThrow(res, "reviewQueue.list");
  },
  async bulk(decisions: BulkDecision[], reviewerId: string): Promise<{ results: { questionId: string; lang: string; ok: boolean; error?: string }[] }> {
    const res = await auth.fetch(`${base()}/localisation/review-queue/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions, reviewerId }),
    });
    return jsonOrThrow(res, "reviewQueue.bulk");
  },
};

export const translationEdit = {
  async save(questionId: string, lang: string, payloadTranslation: Record<string, unknown>): Promise<unknown> {
    const res = await auth.fetch(
      `${base()}/content/questions/${encodeURIComponent(questionId)}/translations/${encodeURIComponent(lang)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payloadTranslation }),
      });
    return jsonOrThrow(res, "translationEdit.save");
  },
};
