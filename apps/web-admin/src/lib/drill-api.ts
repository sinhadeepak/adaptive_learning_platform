// Phase 7 (P7-A1) — typed client for the hierarchical drill endpoints.

import { auth } from "./api";
import { env } from "./env";

const apiFetch = async <T,>(path: string): Promise<T> => {
  const res = await auth.fetch(`${env.apiBaseUrl}${path}`);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail?.message) msg = body.detail.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
};

// ─── Drill responses ────────────────────────────────────────────────

export interface DrillTenantRow {
  tenant_id: string;
  n_students_topic_sum: number;
  avg_ewa: number;
  avg_weak_pct: number;
  last_activity: string | null;
}

export interface DrillExamRow {
  examId: string;
  examName: string | null;
  examCode: string | null;
  studentCount: number;
  avgReadiness: number;
}

export interface DrillSubjectRow {
  subjectId: string;
  subjectName: string | null;
  studentCount: number;
  avgReadiness: number;
  importanceWeightedReadiness: number;
  weakPct: number;
  topicCount: number;
}

export interface ImportanceMeta {
  weight: number;
  source: "override" | "pyq" | "blueprint" | "uniform";
  confidence: number;
  hidden?: boolean;
}

export interface DrillTopicRow {
  topicId: string;
  topicTitle: string | null;
  studentCount: number;
  avgReadiness: number;
  weakPct: number;
  importance: ImportanceMeta | null;
}

export interface DrillConceptRow {
  conceptId: string;
  conceptTitle: string | null;
  studentCount: number;
  avgReadiness: number;
  bloomMatrix: Record<string, { avgEwa: number; n: number }>;
}

export interface DrillStudentRow {
  userId: string;
  ewa: number;
  n: number;
  lastActiveAt: string | null;
  isWeak: boolean;
}

export interface ColdStartProjection {
  type: string;
  exam_code?: string | null;
  subjects?: { name: string; expectedAvgReadiness: number }[];
  note?: string;
}

export const drill = {
  tenants(): Promise<{
    tenants: DrillTenantRow[];
    coldStart?: boolean;
    projection?: ColdStartProjection;
  }> {
    return apiFetch("/analytics/drill/tenants");
  },
  exams(tenantId: string): Promise<{
    exams: DrillExamRow[];
    coldStart?: boolean;
    projection?: ColdStartProjection;
  }> {
    return apiFetch(`/analytics/drill/tenant/${encodeURIComponent(tenantId)}/exams`);
  },
  subjects(
    tenantId: string,
    examId: string,
    withImportance = true,
  ): Promise<{ subjects: DrillSubjectRow[] }> {
    return apiFetch(
      `/analytics/drill/tenant/${encodeURIComponent(tenantId)}/exam/${encodeURIComponent(examId)}/subjects?withImportance=${withImportance}`,
    );
  },
  topics(
    tenantId: string,
    examId: string,
    subjectId: string,
    withImportance = true,
  ): Promise<{ topics: DrillTopicRow[] }> {
    return apiFetch(
      `/analytics/drill/tenant/${encodeURIComponent(tenantId)}/exam/${encodeURIComponent(examId)}/subject/${encodeURIComponent(subjectId)}/topics?withImportance=${withImportance}`,
    );
  },
  concepts(
    tenantId: string,
    examId: string,
    subjectId: string,
    topicId: string,
  ): Promise<{ concepts: DrillConceptRow[] }> {
    return apiFetch(
      `/analytics/drill/tenant/${encodeURIComponent(tenantId)}/exam/${encodeURIComponent(examId)}/subject/${encodeURIComponent(subjectId)}/topic/${encodeURIComponent(topicId)}/concepts`,
    );
  },
  students(
    tenantId: string,
    examId: string,
    topicId: string,
    limit = 50,
  ): Promise<{ students: DrillStudentRow[] }> {
    return apiFetch(
      `/analytics/drill/tenant/${encodeURIComponent(tenantId)}/exam/${encodeURIComponent(examId)}/topic/${encodeURIComponent(topicId)}/students?limit=${limit}`,
    );
  },
};

// ─── Importance management (admin) ──────────────────────────────────

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
  list(examId: string, includeHidden = false): Promise<{
    examId: string;
    topics: ImportanceTopicResponse[];
    sourceSummary: Record<string, number>;
  }> {
    return apiFetch(
      `/catalog/topic-importance?examId=${encodeURIComponent(examId)}&includeHidden=${includeHidden}`,
    );
  },
  adminList(examId: string) {
    return apiFetch<{
      examId: string;
      topics: ImportanceTopicResponse[];
      sourceSummary: Record<string, number>;
    }>(`/catalog/admin/topic-importance/${encodeURIComponent(examId)}`);
  },
  async setOverride(
    examId: string,
    topicId: string,
    body: { weight: number; hidden?: boolean; reason?: string },
  ): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/catalog/admin/topic-importance/${encodeURIComponent(examId)}/${encodeURIComponent(topicId)}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },
  async clearOverride(examId: string, topicId: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/catalog/admin/topic-importance/${encodeURIComponent(examId)}/${encodeURIComponent(topicId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },
};
