/**
 * Phase 5 admin endpoints.
 *
 * Wraps:
 *   GET  /admin/ai-cost
 *   POST /admin/ai-audit-log/purge
 *   GET  /evaluation/calibration/dashboard
 *   GET  /evaluation/calibration/criteria/{criterion}
 *   POST /evaluation/responses/{id}/re-evaluate
 *   GET  /localisation/analytics
 *   POST /localisation/glossary/{subject}/{lang_pair}
 *   GET  /localisation/glossary/{subject}/{lang_pair}
 *   GET  /content/questions/{id}/translations
 *   POST /content/questions/{id}/translations/{lang}/review
 */

import { auth } from "./api";
import { env } from "./env";

// ── Cost dashboard ─────────────────────────────────────────────────────────

export interface CostRollup {
  period: "day" | "week" | "month";
  totalUsd: number;
  callCount: number;
  byTouchpoint: Record<string, number>;
  byProvider: Record<string, number>;
  topCreators: { creatorId: string; costUsd: number }[];
}

export interface BudgetAlert {
  period: string;
  thresholdPct: number;
  currentUsd: number;
  budgetUsd: number;
}

export interface CostDashboardResponse {
  day: CostRollup;
  week: CostRollup;
  month: CostRollup;
  alerts: BudgetAlert[];
}

export const cost = {
  async dashboard(): Promise<CostDashboardResponse> {
    const res = await auth.fetch(`${env.apiBaseUrl}/admin/ai-cost`);
    if (!res.ok) throw new Error(`cost dashboard fetch failed: ${res.status}`);
    return res.json() as Promise<CostDashboardResponse>;
  },
  async purgeAuditLog(days = 90): Promise<{ rowsDeleted: number; days: number }> {
    const res = await auth.fetch(`${env.apiBaseUrl}/admin/ai-audit-log/purge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });
    if (!res.ok) throw new Error(`audit log purge failed: ${res.status}`);
    return res.json();
  },
};

// ── Calibration dashboard ───────────────────────────────────────────────────

export interface CalibrationCriterionStats {
  criterion: string;
  kappa: number | null;
  sample_count: number;
  auto_paused: boolean;
  weekly_trend: Array<{ week_start: string; sample_count: number; kappa: number | null }>;
}

export interface CalibrationDashboardResponse {
  asOf: string;
  floorKappa: number;
  autoPausedCriteria: string[];
  criteria: CalibrationCriterionStats[];
}

export const calibration = {
  async dashboard(weeks = 12): Promise<CalibrationDashboardResponse> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/evaluation/calibration/dashboard?weeks=${weeks}`,
    );
    if (!res.ok) throw new Error(`calibration dashboard fetch failed: ${res.status}`);
    return res.json();
  },
  async criterionDrilldown(criterion: string, weeks = 12) {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/evaluation/calibration/criteria/${encodeURIComponent(criterion)}?weeks=${weeks}`,
    );
    if (!res.ok) throw new Error(`criterion drilldown fetch failed: ${res.status}`);
    return res.json();
  },
};

// ── Translation analytics ──────────────────────────────────────────────────

export interface TranslationAnalyticsRow {
  language: string;
  translationsTotal: number;
  translationsPublished: number;
  translationsDraft: number;
  translationsInReview: number;
  avgAiConfidence: number | null;
  acceptanceRate: number | null;
  retranslationRate: number | null;
  culturalFlagRate: number | null;
  leadTimeP50Hours: number | null;
  leadTimeP95Hours: number | null;
}

export interface TranslationAnalyticsResponse {
  weeks: number;
  targets: {
    acceptanceRateTarget: number;
    retranslationRateCeiling: number;
    leadTimeP95HoursTarget: number;
  };
  perLanguage: TranslationAnalyticsRow[];
  glossarySize: Array<{
    subject: string;
    sourceLang: string;
    targetLang: string;
    entryCount: number;
  }>;
}

export const translationAnalytics = {
  async fetch(weeks = 12): Promise<TranslationAnalyticsResponse> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/localisation/analytics?weeks=${weeks}`,
    );
    if (!res.ok) throw new Error(`translation analytics fetch failed: ${res.status}`);
    return res.json();
  },
};

// ── Translation review ─────────────────────────────────────────────────────

export interface TranslationStatusRow {
  artifactId: string;
  language: string;
  status: "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "REJECTED";
  aiConfidence: number | null;
  version: number;
  updatedAt: string;
}

export interface SingleTranslation {
  artifactId: string;
  language: string;
  status: string;
  payloadTranslation: Record<string, unknown>;
  aiConfidence: number | null;
  version: number;
  reviewerId: string | null;
  updatedAt: string;
}

export const translation = {
  async listForArtifact(questionId: string): Promise<TranslationStatusRow[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/questions/${encodeURIComponent(questionId)}/translations`,
    );
    if (!res.ok) throw new Error(`translation list failed: ${res.status}`);
    const body = await res.json();
    return body.translations as TranslationStatusRow[];
  },
  async getOne(questionId: string, lang: string): Promise<SingleTranslation> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/questions/${encodeURIComponent(questionId)}/translations/${lang}`,
    );
    if (!res.ok) throw new Error(`translation fetch failed: ${res.status}`);
    return res.json();
  },
  async review(
    questionId: string,
    lang: string,
    action: "approve" | "reject",
    reviewerId: string,
    rejectionReason?: string,
  ): Promise<SingleTranslation> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/questions/${encodeURIComponent(questionId)}/translations/${lang}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewerId, rejectionReason }),
      },
    );
    if (!res.ok) throw new Error(`translation review failed: ${res.status}`);
    return res.json();
  },
};

// ── Glossary management ────────────────────────────────────────────────────

export interface GlossaryEntry {
  id: string;
  subject: string;
  source_lang: string;
  target_lang: string;
  source_term: string;
  target_term: string;
  category: "platform" | "subject" | "exam" | "locked" | "cultural";
  case_sensitive: boolean;
  context_hint: string | null;
}

export const glossary = {
  async list(subject: string, langPair: string): Promise<GlossaryEntry[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/localisation/glossary/${encodeURIComponent(subject)}/${encodeURIComponent(langPair)}`,
    );
    if (!res.ok) throw new Error(`glossary list failed: ${res.status}`);
    const body = await res.json();
    return body.entries as GlossaryEntry[];
  },
  async upsert(
    subject: string,
    langPair: string,
    entry: Omit<GlossaryEntry, "id">,
  ): Promise<{ id: string; status: string }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/localisation/glossary/${encodeURIComponent(subject)}/${encodeURIComponent(langPair)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      },
    );
    if (!res.ok) throw new Error(`glossary upsert failed: ${res.status}`);
    return res.json();
  },
};
