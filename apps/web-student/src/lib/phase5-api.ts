/**
 * Phase 5 student endpoints.
 *
 * Wraps:
 *   GET  /analytics/concept-mastery/{user_id}
 *   GET  /analytics/student/{user_id}/multi-profile
 *   GET  /analytics/transfer/{user_id}
 *   POST /adaptive/diagnostic/root-cause
 *   POST /adaptive/select-multi-dim
 */

import { auth } from "./api";
import { env } from "./env";

// ── Multi-parameter profile (S39 + S41 + S42) ──────────────────────────────

export interface ConceptMasteryRow {
  conceptId: string;
  ewa: number;
  n: number;
  lastSeenAt: string | null;
}

export interface BloomMatrix {
  [conceptId: string]: { [bloomLevel: string]: { ewa: number; n: number } };
}

export interface FluencyRow {
  conceptId: string;
  expectedMsBaseline: number;
  actualMsRollingAvg: number;
  fluencyScore: number;
  n: number;
}

export interface MultiProfileResponse {
  userId: string;
  since: string | null;
  concepts: ConceptMasteryRow[];
  bloomMatrix: BloomMatrix;
  fluency: FluencyRow[];
  confidenceBrier: number | null;
}

export interface TransferRow {
  conceptId: string;
  transferScore: number | null;
  n_single_tag: number;
  n_multi_tag: number;
  accuracy_single_tag: number;
  accuracy_multi_tag: number;
  min_n_per_bucket: number;
}

export const studentProfile = {
  async multiProfile(userId: string, since?: string): Promise<MultiProfileResponse> {
    const url = since
      ? `${env.apiBaseUrl}/analytics/student/${encodeURIComponent(userId)}/multi-profile?since=${encodeURIComponent(since)}`
      : `${env.apiBaseUrl}/analytics/student/${encodeURIComponent(userId)}/multi-profile`;
    const res = await auth.fetch(url);
    if (!res.ok) throw new Error(`multi-profile fetch failed: ${res.status}`);
    return res.json();
  },
  async conceptMastery(userId: string): Promise<{ userId: string; concepts: ConceptMasteryRow[] }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/concept-mastery/${encodeURIComponent(userId)}`,
    );
    if (!res.ok) throw new Error(`concept-mastery fetch failed: ${res.status}`);
    return res.json();
  },
  async transfer(userId: string, minN = 3): Promise<{ userId: string; transfer: TransferRow[]; minNPerBucket: number }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/transfer/${encodeURIComponent(userId)}?min_n_per_bucket=${minN}`,
    );
    if (!res.ok) throw new Error(`transfer fetch failed: ${res.status}`);
    return res.json();
  },
};

// ── Diagnostic root-cause ─────────────────────────────────────────────────

export interface RootCauseEdge {
  fromConceptId: string;
  toConceptId: string;
  weight?: number | null;
}

export interface RootCauseResponse {
  primaryConceptId: string;
  rootCauseConceptId: string | null;
  path: string[];
  weakConcepts: string[];
  notes: string[];
}

export const diagnostic = {
  async rootCause(
    primaryConceptId: string,
    userConceptMastery: Record<string, number>,
    edges: RootCauseEdge[],
    weakThreshold = 0.4,
  ): Promise<RootCauseResponse> {
    const res = await auth.fetch(`${env.apiBaseUrl}/adaptive/diagnostic/root-cause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryConceptId,
        userConceptMastery,
        edges,
        weakThreshold,
      }),
    });
    if (!res.ok) throw new Error(`root-cause fetch failed: ${res.status}`);
    return res.json();
  },
};
