/**
 * Track 2 follow-ups — teacher analytics API client.
 *
 * Mirrors apps/mobile/lib/api/analytics.dart conventions: namespace
 * objects + auth.fetch + asJson<T>. Added in Sprint A3.
 */

import { auth } from "./api";
import { env } from "./env";

async function asJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`${label} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// ── Types ──────────────────────────────────────────────────────────

export interface TeacherCohortRow {
  cohortId: string;
  snapshotDate: string | null;
  nStudents: number;
  avgReadiness: number;
  deltaReadiness7d: number;
  deltaReadiness30d: number;
  nAtRisk: number;
  nTopQuartile: number;
}

export interface TopicHeatmapRow {
  topicId: string;
  topicTitle: string;
  avgEwa: number;
  nStudents: number;
}

export interface CohortTrendPoint {
  date: string;
  avgReadiness: number;
  medianReadiness: number;
  p25Readiness: number;
  p75Readiness: number;
  nStudents: number;
}

export interface CohortStudentEngagement {
  userId: string;
  lastActive: string | null;
  sessions30d: number;
}

export interface ManualInterventionIn {
  student_id: string;
  educator_id: string;
  cohort_id: string;
  topic_id: string;
  action: "REVISE" | "DIAGNOSE" | "PRACTICE";
  reason?: string;
}

// ── Teacher namespace ──────────────────────────────────────────────

export const teacherAnalytics = {
  async dashboard(teacherId: string): Promise<{ teacherId: string; cohorts: TeacherCohortRow[] }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/teacher/${encodeURIComponent(teacherId)}/dashboard`,
    );
    return asJson(res, "teacher dashboard");
  },

  async topicHeatmap(cohortId: string, limit = 25): Promise<{ cohortId: string; topics: TopicHeatmapRow[] }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/cohorts/${encodeURIComponent(cohortId)}/topic-heatmap?limit=${limit}`,
    );
    return asJson(res, "topic heatmap");
  },

  async trend(cohortId: string, days = 30): Promise<{ cohortId: string; days: number; points: CohortTrendPoint[] }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/cohorts/${encodeURIComponent(cohortId)}/trend?days=${days}`,
    );
    return asJson(res, "cohort trend");
  },

  async engagement(cohortId: string): Promise<{ cohortId: string; students: CohortStudentEngagement[] }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/cohorts/${encodeURIComponent(cohortId)}/engagement`,
    );
    return asJson(res, "cohort engagement");
  },

  async assignmentCompliance(cohortId: string): Promise<{ cohortId: string; assignments: unknown[]; note?: string }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/cohorts/${encodeURIComponent(cohortId)}/assignment-compliance`,
    );
    return asJson(res, "assignment compliance");
  },

  async flagIntervention(body: ManualInterventionIn): Promise<{ id: string; created_at: string }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/analytics/manual-interventions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return asJson(res, "flag intervention");
  },
};
