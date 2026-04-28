import { createAuthClient, type AuthClient } from "@alp/auth-client";
import { env } from "./env";

function createSessionExpiredHandler() {
  let notified = false;
  return () => {
    if (notified) return;
    notified = true;
    sessionStorage.setItem("alp.admin.returnTo", window.location.pathname + window.location.search);
    window.location.assign("/login?reason=expired");
  };
}

export const auth: AuthClient = createAuthClient({
  baseUrl: env.apiBaseUrl,
  onSessionExpired: createSessionExpiredHandler(),
});

export interface FlagSummary {
  name: string;
  description: string | null;
  defaultValue: boolean;
  dangerCritical: boolean;
  owner: string | null;
  blastRadius: string | null;
  overrideCount: number;
  updatedAt: string;
}

export interface FlagOverride {
  tenantId: string;
  value: boolean;
  setByUserId: string | null;
  setAt: string;
}

export interface FlagAuditEntry {
  ts: string;
  flagName: string;
  scope: string;
  tenantId: string | null;
  oldValue: boolean | null;
  newValue: boolean | null;
  actorUserId: string | null;
  rationale: string | null;
}

export interface FlagDetail extends FlagSummary {
  overrides: FlagOverride[];
  audit: FlagAuditEntry[];
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

export const flags = {
  async list(): Promise<FlagSummary[]> {
    const res = await auth.fetch(`${env.apiBaseUrl}/flags`);
    return asJson<FlagSummary[]>(res);
  },
  async get(name: string): Promise<FlagDetail> {
    const res = await auth.fetch(`${env.apiBaseUrl}/flags/${encodeURIComponent(name)}`);
    return asJson<FlagDetail>(res);
  },
  async setDefault(name: string, value: boolean, rationale?: string): Promise<FlagSummary> {
    const res = await auth.fetch(`${env.apiBaseUrl}/flags/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value, rationale: rationale ?? null }),
    });
    return asJson<FlagSummary>(res);
  },
  async setOverride(
    name: string,
    tenantId: string,
    value: boolean,
    rationale?: string,
  ): Promise<FlagSummary> {
    const url = `${env.apiBaseUrl}/flags/${encodeURIComponent(name)}/tenants/${encodeURIComponent(tenantId)}`;
    const res = await auth.fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value, rationale: rationale ?? null }),
    });
    return asJson<FlagSummary>(res);
  },
  async listAudit(limit = 200): Promise<FlagAuditEntry[]> {
    const res = await auth.fetch(`${env.apiBaseUrl}/flags/audit?limit=${limit}`);
    return asJson<FlagAuditEntry[]>(res);
  },
};

// Educator scope — manage which educator can author against which exam.

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  role: string;
  adminAccessLevel: string;
  accountStatus: string;
}

export interface AdminCatalogExam {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
  iconKey?: string | null;
}

export interface AdminEducatorAssignment {
  id: string;
  educatorId: string;
  examId: string;
  subjectId: string | null;
  createdAt: string;
  createdBy: string | null;
}

export const adminUsers = {
  async list(
    opts: { roles?: string[]; q?: string; limit?: number } = {},
  ): Promise<AdminUserSummary[]> {
    const params = new URLSearchParams();
    for (const r of opts.roles ?? []) params.append("role", r);
    if (opts.q) params.set("q", opts.q);
    if (opts.limit) params.set("limit", String(opts.limit));
    const res = await auth.fetch(
      `${env.apiBaseUrl}/auth/admin/users${params.toString() ? `?${params}` : ""}`,
    );
    const body = await asJson<{ items: AdminUserSummary[] }>(res);
    return body.items;
  },
};

export const adminCatalog = {
  async listExams(): Promise<AdminCatalogExam[]> {
    const res = await auth.fetch(`${env.apiBaseUrl}/catalog/exams`);
    return asJson<AdminCatalogExam[]>(res);
  },

  async listAssignments(
    educatorId: string,
  ): Promise<AdminEducatorAssignment[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/catalog/admin/educators/${encodeURIComponent(educatorId)}/assignments`,
    );
    return asJson<AdminEducatorAssignment[]>(res);
  },

  async createAssignment(
    educatorId: string,
    examId: string,
    subjectId: string | null = null,
  ): Promise<AdminEducatorAssignment> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/catalog/admin/educators/${encodeURIComponent(educatorId)}/assignments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ examId, subjectId }),
      },
    );
    return asJson<AdminEducatorAssignment>(res);
  },

  async deleteAssignment(assignmentId: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/catalog/admin/educators/assignments/${encodeURIComponent(assignmentId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  },
};

// ── Sprint 10 S10-C — Institution Core CRUD (admin surface) ──────────

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  kind: "SCHOOL" | "COACHING_CENTER" | "UNIVERSITY" | "OTHER";
  seatLimit: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCohort {
  id: string;
  tenantId: string;
  name: string;
  exam: string | null;
  year: number | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AdminCohortMember {
  cohortId: string;
  userId: string;
  role: "STUDENT" | "LEAD_TEACHER";
  joinedAt: string;
}

export const tenants = {
  async create(input: {
    name: string;
    kind: AdminTenant["kind"];
    slug?: string;
    seatLimit?: number | null;
  }): Promise<AdminTenant> {
    const res = await auth.fetch(`${env.apiBaseUrl}/institution/tenants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        kind: input.kind,
        slug: input.slug,
        seatLimit: input.seatLimit ?? null,
      }),
    });
    return asJson<AdminTenant>(res);
  },

  async get(tenantId: string): Promise<AdminTenant> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/tenants/${encodeURIComponent(tenantId)}`,
    );
    return asJson<AdminTenant>(res);
  },

  async cohorts(tenantId: string): Promise<AdminCohort[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/tenants/${encodeURIComponent(tenantId)}/cohorts`,
    );
    return asJson<AdminCohort[]>(res);
  },

  async createCohort(
    tenantId: string,
    input: { name: string; exam?: string; year?: number },
  ): Promise<AdminCohort> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/tenants/${encodeURIComponent(tenantId)}/cohorts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    return asJson<AdminCohort>(res);
  },
};

// ── Sprint 12 S12-A — invite list/create/revoke ───────────────────────

export interface AdminInviteListEntry {
  id: string;
  cohortId: string;
  tokenPreview: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface AdminInviteCreated {
  id: string;
  cohortId: string;
  // The full token is returned ONLY on create — the list endpoint
  // redacts. Educator copies the link from the toast and never
  // re-fetches the secret.
  token: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

export const cohorts = {
  async invites(cohortId: string): Promise<AdminInviteListEntry[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/cohorts/${encodeURIComponent(cohortId)}/invites`,
    );
    return asJson<AdminInviteListEntry[]>(res);
  },

  async createInvite(
    cohortId: string,
    input: { maxUses?: number | null },
  ): Promise<AdminInviteCreated> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/cohorts/${encodeURIComponent(cohortId)}/invites`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxUses: input.maxUses ?? null }),
      },
    );
    return asJson<AdminInviteCreated>(res);
  },

  async revokeInvite(inviteId: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/cohorts/invites/${encodeURIComponent(inviteId)}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status}`);
    }
  },

  // Sprint 13 S13-B — invite claim funnel.
  async listClaims(inviteId: string): Promise<
    {
      id: string;
      inviteId: string;
      userId: string;
      claimedAt: string;
    }[]
  > {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/cohorts/invites/${encodeURIComponent(inviteId)}/claims`,
    );
    return asJson(res);
  },

  async members(cohortId: string): Promise<AdminCohortMember[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/cohorts/${encodeURIComponent(cohortId)}/members`,
    );
    return asJson<AdminCohortMember[]>(res);
  },

  async addMember(
    cohortId: string,
    input: { userId: string; role?: AdminCohortMember["role"] },
  ): Promise<AdminCohortMember> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/cohorts/${encodeURIComponent(cohortId)}/members`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: input.userId, role: input.role ?? "STUDENT" }),
      },
    );
    return asJson<AdminCohortMember>(res);
  },

  async removeMember(cohortId: string, userId: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/cohorts/${encodeURIComponent(cohortId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status}`);
    }
  },
};

// ── Sprint 17 (P3-S2) — Marketplace admin moderation ─────────────────

export interface TutorQueueItem {
  userId: string;
  displayName: string;
  headline: string;
  hourlyRatePaise: number;
  applicationStatus: string;
  appliedAt: string;
  kycStatus: string | null;
}

export interface TutorAdminAction {
  id: string;
  adminUserId: string;
  tutorUserId: string;
  action: "APPROVE" | "REJECT" | "SUSPEND" | "REACTIVATE";
  reason: string | null;
  createdAt: string;
}

export const marketplaceAdmin = {
  async queue(status = "KYC_VERIFIED"): Promise<TutorQueueItem[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/admin/tutors/queue?status=${encodeURIComponent(status)}`,
    );
    const body = await asJson<{ items: TutorQueueItem[] }>(res);
    return body.items;
  },

  async approve(userId: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/admin/tutors/${encodeURIComponent(userId)}/approve`,
      { method: "POST" },
    );
    await asJson(res);
  },

  async reject(userId: string, reason: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/admin/tutors/${encodeURIComponent(userId)}/reject`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
    await asJson(res);
  },

  async actions(userId: string): Promise<TutorAdminAction[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/admin/tutors/${encodeURIComponent(userId)}/actions`,
    );
    const body = await asJson<{ items: TutorAdminAction[] }>(res);
    return body.items;
  },
};

// ── Sprint 20 (P3-S5) — Rating moderation ────────────────────────────

export const ratingModeration = {
  async hide(kind: "session" | "course", ratingId: string, reason: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/admin/ratings/${kind}/${encodeURIComponent(ratingId)}/hide`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
    if (!res.ok && res.status !== 204) throw new Error(res.statusText);
  },

  async unhide(kind: "session" | "course", ratingId: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/admin/ratings/${kind}/${encodeURIComponent(ratingId)}/unhide`,
      { method: "POST" },
    );
    if (!res.ok && res.status !== 204) throw new Error(res.statusText);
  },

  async listForCourse(courseId: string): Promise<{ targetId: string; averageStars: number; count: number; recent: { id: string; stars: number; comment: string | null; createdAt: string; studentUserId: string }[] }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}/ratings`,
    );
    return asJson(res);
  },

  async listForTutor(tutorUserId: string): Promise<{ targetId: string; averageStars: number; count: number; recent: { id: string; stars: number; comment: string | null; createdAt: string; studentUserId: string }[] }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/tutors/${encodeURIComponent(tutorUserId)}/ratings`,
    );
    return asJson(res);
  },
};
