/**
 * Track 2 follow-ups — admin analytics API client.
 *
 * Mirrors web-admin/src/lib/phase5-api.ts conventions. Two namespace
 * objects:
 *   - institution  (Sprint A5 — 7 endpoints)
 *   - platformAnalytics (Sprint A6 + A7 — 9 endpoints)
 */

import { auth } from "./api";
import { env } from "./env";

async function asJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ── Institution (Sprint A5) ────────────────────────────────────────

export interface InstitutionOverview {
  tenantId: string;
  nStudents: number;
  nActive7d: number;
  avgReadiness: number;
  medianReadiness: number;
}

export interface InstitutionCohortRow {
  cohortId: string;
  snapshotDate: string | null;
  avgReadiness: number;
  nStudents: number;
  nActive7d: number;
}

export interface TeacherEffectivenessRow {
  educatorId: string;
  nStudents: number;
  avgReadiness: number;
  delta7d: number;
  delta30d: number;
}

export interface SubjectGapRow {
  topicId: string;
  avgEwa: number;
  nRows: number;
}

export interface InstitutionTrendPoint {
  date: string;
  avgReadiness: number;
  medianReadiness: number;
  nStudents: number;
  nActive7d: number;
}

export interface MarketplaceRoi {
  tenantId: string;
  coursePurchases: number;
  tutorSessions: number;
  avgBuyerReadiness: number;
  avgNonBuyerReadiness: number;
  note?: string;
}

export interface InstitutionBenchmark {
  tenantId: string;
  hidden: boolean;
  reason?: string;
  kRequired?: number;
  peerCount?: number;
  ownAvgReadiness?: number;
  peerAvgReadiness?: number;
}

export const institution = {
  async overview(tenantId: string): Promise<InstitutionOverview> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/institution/${encodeURIComponent(tenantId)}/overview`);
    return asJson(r, "institution overview");
  },
  async cohorts(tenantId: string): Promise<{ tenantId: string; cohorts: InstitutionCohortRow[] }> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/institution/${encodeURIComponent(tenantId)}/cohorts`);
    return asJson(r, "institution cohorts");
  },
  async teacherEffectiveness(
    tenantId: string,
  ): Promise<{ tenantId: string; teachers: TeacherEffectivenessRow[] }> {
    const r = await auth.fetch(
      `${env.apiBaseUrl}/analytics/institution/${encodeURIComponent(tenantId)}/teacher-effectiveness`,
    );
    return asJson(r, "teacher effectiveness");
  },
  async subjectGaps(tenantId: string): Promise<{ tenantId: string; topics: SubjectGapRow[] }> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/institution/${encodeURIComponent(tenantId)}/subject-gaps`);
    return asJson(r, "subject gaps");
  },
  async trend(
    tenantId: string,
    days = 90,
  ): Promise<{ tenantId: string; days: number; points: InstitutionTrendPoint[] }> {
    const r = await auth.fetch(
      `${env.apiBaseUrl}/analytics/institution/${encodeURIComponent(tenantId)}/trend?days=${days}`,
    );
    return asJson(r, "institution trend");
  },
  async marketplaceRoi(tenantId: string): Promise<MarketplaceRoi> {
    const r = await auth.fetch(
      `${env.apiBaseUrl}/analytics/institution/${encodeURIComponent(tenantId)}/marketplace-roi`,
    );
    return asJson(r, "marketplace roi");
  },
  async benchmark(tenantId: string): Promise<InstitutionBenchmark> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/institution/${encodeURIComponent(tenantId)}/benchmark`);
    return asJson(r, "institution benchmark");
  },
};

// ── Platform (Sprint A6 + A7) ──────────────────────────────────────

export interface FunnelStep {
  event: string;
  userCount: number;
}
export interface DauMau {
  dau: number;
  wau: number;
  mau: number;
  stickiness: number;
}
export interface RetentionCohort {
  week: string | null;
  cohortSize: number;
  week1Retained: number;
  week1Retention: number;
}
export interface QuestionQualityRow {
  questionId: string;
  exposure: number;
  accuracy: number;
}
export interface MockBucket {
  bucket: number;
  n: number;
}
export interface OutcomeCorrelation {
  examCode: string;
  hidden: boolean;
  reason?: string;
  minRequired?: number;
  n?: number;
  intercept?: number;
  slope?: number;
  r2?: number;
  samples?: { mastery: number; realScore: number }[];
}

export const platformAnalytics = {
  async funnels(days = 30): Promise<{ days: number; steps: FunnelStep[] }> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/platform/funnels?days=${days}`);
    return asJson(r, "platform funnels");
  },
  async dauMau(): Promise<DauMau> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/platform/dau-mau`);
    return asJson(r, "platform dau-mau");
  },
  async retention(weeks = 8): Promise<{ weeks: number; cohorts: RetentionCohort[] }> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/platform/retention?weeks=${weeks}`);
    return asJson(r, "platform retention");
  },
  async questionQuality(limit = 50): Promise<{ items: QuestionQualityRow[] }> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/platform/question-quality?limit=${limit}`);
    return asJson(r, "question quality");
  },
  async mockDistributions(examCode: string): Promise<{ examCode: string; buckets: MockBucket[] }> {
    const r = await auth.fetch(
      `${env.apiBaseUrl}/analytics/platform/mock-distributions/${encodeURIComponent(examCode)}`,
    );
    return asJson(r, "mock distributions");
  },
  async subscriptionHealth(): Promise<{
    activeSubscriptions: number;
    premiumThisMonth: number;
    churnLast30d: number;
    upgradeRateLast30d: number;
    note?: string;
  }> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/platform/subscription-health`);
    return asJson(r, "subscription health");
  },
  async tutorMarketplace(): Promise<{
    sessionsLast30d: number;
    avgRating: number;
    totalRevenuePaise: number;
    note?: string;
  }> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/platform/tutor-marketplace`);
    return asJson(r, "tutor marketplace");
  },
  async costPerStudent(): Promise<{
    dau: number;
    estLlmCostUsdMonthly: number;
    estInfraCostUsdMonthly: number;
    costPerStudentUsd: number;
    note?: string;
  }> {
    const r = await auth.fetch(`${env.apiBaseUrl}/analytics/platform/cost-per-student`);
    return asJson(r, "cost-per-student");
  },
  async outcomeCorrelation(examCode: string): Promise<OutcomeCorrelation> {
    const r = await auth.fetch(
      `${env.apiBaseUrl}/analytics/platform/outcome-correlation/${encodeURIComponent(examCode)}`,
    );
    return asJson(r, "outcome correlation");
  },
};
