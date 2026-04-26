import { createAuthClient, type AuthClient } from "@alp/auth-client";
import { env } from "./env";

function createSessionExpiredHandler() {
  let notified = false;
  return () => {
    if (notified) return;
    notified = true;
    sessionStorage.setItem("alp.portal.returnTo", window.location.pathname + window.location.search);
    window.location.assign("/login?reason=expired");
  };
}

export const auth: AuthClient = createAuthClient({
  baseUrl: env.apiBaseUrl,
  onSessionExpired: createSessionExpiredHandler(),
});

export interface Question {
  id: string;
  topicId: string;
  stem: string;
  choices: string[];
  correctIdx: number;
  difficultyB: number;
  discriminationA: number;
  guessingC: number;
  language: string;
  status: "DRAFT" | "REVIEW" | "PUBLISHED" | "REJECTED" | "RETIRED";
  createdBy: string;
  createdAt: string;
  submittedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
}

export interface CreateQuestionInput {
  topicId: string;
  stem: string;
  choices: string[];
  correctIdx: number;
  difficultyB?: number;
  // IRT calibration — optional. Omit to use defaults (a=1.0, c=0.0,
  // effectively 2PL). Set when subject-matter experts have calibration data.
  discriminationA?: number;
  guessingC?: number;
  language?: "en" | "hi";
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { detail?: { message?: string; code?: string } };
      if (body.detail?.message) msg = body.detail.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export interface CatalogExam {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
  iconKey?: string | null;
}

export interface CatalogSubject {
  id: string;
  examId: string;
  name: string;
  topicCount: number;
}

export interface CatalogTopic {
  id: string;
  subjectId: string;
  title: string;
  titleHi?: string | null;
  questionCount: number;
  tier: "FREE" | "PREMIUM";
}

export const catalog = {
  /** Exams the current educator is assigned to (PLATFORM_ADMIN sees all). */
  async myExams(): Promise<CatalogExam[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/catalog/educators/me/exams`,
    );
    return asJson<CatalogExam[]>(res);
  },

  /** Subjects under `examId` the current educator can author for. */
  async mySubjects(examId: string): Promise<CatalogSubject[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/catalog/educators/me/exams/${encodeURIComponent(examId)}/subjects`,
    );
    return asJson<CatalogSubject[]>(res);
  },

  /** Topics under a subject — public endpoint, no scoping. */
  async topics(subjectId: string): Promise<CatalogTopic[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/catalog/subjects/${encodeURIComponent(subjectId)}/topics`,
    );
    return asJson<CatalogTopic[]>(res);
  },
};

export const content = {
  async create(input: CreateQuestionInput): Promise<Question> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return asJson<Question>(res);
  },

  async listMine(statusFilter?: string): Promise<Question[]> {
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    const res = await auth.fetch(`${env.apiBaseUrl}/content/questions${qs}`);
    const body = await asJson<{ items: Question[] }>(res);
    return body.items;
  },

  async listAll(statusFilter?: string): Promise<Question[]> {
    const params = new URLSearchParams({ scope: "all" });
    if (statusFilter) params.set("status", statusFilter);
    const res = await auth.fetch(`${env.apiBaseUrl}/content/questions?${params}`);
    const body = await asJson<{ items: Question[] }>(res);
    return body.items;
  },

  async get(id: string): Promise<Question> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/questions/${id}`);
    return asJson<Question>(res);
  },

  async submit(id: string): Promise<Question> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/questions/${id}/submit`, {
      method: "POST",
    });
    return asJson<Question>(res);
  },

  async review(id: string, approve: boolean, notes?: string): Promise<Question> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/questions/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve, notes: notes ?? null }),
    });
    return asJson<Question>(res);
  },
};
