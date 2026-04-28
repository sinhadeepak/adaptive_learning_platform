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
  // Teaching note shown alongside the correct answer in QuizResult.
  explanation?: string | null;
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

// ── Sprint 10 — Educator Assignments authoring (web-portal) ──────────

export interface Assignment {
  id: string;
  cohortId: string;
  tenantId: string | null;
  title: string;
  description: string | null;
  createdBy: string;
  dueAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardRow {
  userId: string;
  correctCount: number;
  totalCount: number;
  accuracyPct: number;
  completedAt: string;
}

export const assignments = {
  async listForCohort(cohortId: string): Promise<Assignment[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/assignments?cohortId=${encodeURIComponent(cohortId)}`,
    );
    return asJson<Assignment[]>(res);
  },

  async get(id: string): Promise<Assignment> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/assignments/${encodeURIComponent(id)}`,
    );
    return asJson<Assignment>(res);
  },

  async create(input: {
    cohortId: string;
    title: string;
    description?: string;
    dueAt?: string | null;
  }): Promise<Assignment> {
    const res = await auth.fetch(`${env.apiBaseUrl}/content/assignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return asJson<Assignment>(res);
  },

  async setQuestions(id: string, questionIds: string[]): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/assignments/${encodeURIComponent(id)}/questions`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionIds }),
      },
    );
    await asJson(res);
  },

  async publish(id: string): Promise<Assignment> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/assignments/${encodeURIComponent(id)}/publish`,
      { method: "POST" },
    );
    return asJson<Assignment>(res);
  },

  async leaderboard(id: string): Promise<LeaderboardRow[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/content/assignments/${encodeURIComponent(id)}/leaderboard`,
    );
    return asJson<LeaderboardRow[]>(res);
  },
};

// ── Sprint 10 — Institution Core (web-portal-side reads) ─────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  kind: string;
  seatLimit: number | null;
}

export interface Cohort {
  id: string;
  tenantId: string;
  name: string;
  exam: string | null;
  year: number | null;
}

export const institution = {
  async cohortsForTenant(tenantId: string): Promise<Cohort[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/tenants/${encodeURIComponent(tenantId)}/cohorts`,
    );
    return asJson<Cohort[]>(res);
  },

  async cohortMembers(
    cohortId: string,
  ): Promise<{ userId: string; role: string; joinedAt: string }[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/institution/cohorts/${encodeURIComponent(cohortId)}/members`,
    );
    return asJson<{ userId: string; role: string; joinedAt: string }[]>(res);
  },
};

// ── Sprint 10 — Cohort leaderboard (analytics surface) ───────────────

export interface CohortLeaderboardRow {
  userId: string;
  role: string;
  score: number;
  nTopics: number;
  started: boolean;
  rank: number;
  updatedAt: string | null;
}

// Sprint 13 S13-D — cohort summary header.
export interface CohortSummary {
  memberCount: number;
  startedCount: number;
  avgReadinessPct: number;
  completionPct: number;
  atRisk: { userId: string; score: number; nTopics: number }[];
}

// Sprint 13 S13-C — per-student drill-down.
export interface StudentDrillDown {
  userId: string;
  cohortId: string;
  readiness: { score: number; nTopics: number; updatedAt: string | null };
  topicMastery: { topicId: string; ewa: number; n: number }[];
  streak: { current: number; longest: number; lastActiveDate: string | null };
  recentSessions: {
    sessionId: string;
    topicId: string | null;
    mode: string;
    servedCount: number;
    correctCount: number;
    accuracyPct: number;
    submittedAt: string | null;
  }[];
}

export const analytics = {
  async cohortLeaderboard(
    cohortId: string,
  ): Promise<{ cohortId: string; leaderboard: CohortLeaderboardRow[] }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/cohorts/${encodeURIComponent(cohortId)}/leaderboard`,
    );
    return asJson<{ cohortId: string; leaderboard: CohortLeaderboardRow[] }>(
      res,
    );
  },

  async cohortSummary(
    cohortId: string,
  ): Promise<{ cohortId: string; summary: CohortSummary }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/cohorts/${encodeURIComponent(cohortId)}/summary`,
    );
    return asJson<{ cohortId: string; summary: CohortSummary }>(res);
  },

  async studentDrillDown(
    cohortId: string,
    userId: string,
  ): Promise<StudentDrillDown> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/cohorts/${encodeURIComponent(cohortId)}/students/${encodeURIComponent(userId)}`,
    );
    return asJson<StudentDrillDown>(res);
  },
};

// AI-assisted authoring (calls adaptive-engine).
export interface GeneratedQuestion {
  stem: string;
  choices: string[];
  correctIdx: number;
  difficultyB: number;
  explanation: string;
  tags: string[];
  language: "en" | "hi";
}

export interface GenerateQuestionsResponse {
  questions: GeneratedQuestion[];
  topicId?: string;
  topicTitle?: string;
  subjectName?: string;
  examName?: string;
  source: "ai" | "stub";
  message?: string;
}

export const adaptive = {
  async generateQuestions(input: {
    topicId: string;
    count: number;
    language: "en" | "hi";
    difficulty: "easy" | "medium" | "hard" | "mixed";
    brief?: string;
  }): Promise<GenerateQuestionsResponse> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/adaptive/authoring/generate-questions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topicId: input.topicId,
          count: input.count,
          language: input.language,
          difficulty: input.difficulty,
          brief: input.brief ?? "",
        }),
      },
    );
    return asJson<GenerateQuestionsResponse>(res);
  },
};

// ── Sprint 16 (P3-S1) — Marketplace tutor application ────────────────

export interface TutorQualification {
  id?: string;
  kind: "DEGREE" | "CERTIFICATE" | "EXAM_RANK" | "TEACHING_EXPERIENCE";
  title: string;
  institution?: string | null;
  yearCompleted?: number | null;
}

export interface TutorAvailability {
  id?: string;
  dayOfWeek: number; // 0=Mon..6=Sun
  startMinute: number; // 0–1439
  endMinute: number; // 0–1440 exclusive of end
}

export interface TutorProfile {
  userId: string;
  displayName: string;
  headline: string;
  bio: string;
  hourlyRatePaise: number;
  tier: "STANDARD" | "PREMIUM_VERIFIED" | "RETIRED";
  applicationStatus:
    | "APPLIED"
    | "KYC_PENDING"
    | "KYC_VERIFIED"
    | "APPROVED"
    | "ACTIVE"
    | "REJECTED"
    | "SUSPENDED";
  kycStatus: string | null;
  qualifications: TutorQualification[];
  availability: TutorAvailability[];
  topicIds: string[];
  appliedAt: string;
  approvedAt: string | null;
}

export interface KycStartOut {
  sessionId: string;
  redirectUrl: string | null;
}

export interface KycPollOut {
  sessionId: string;
  status: "pending" | "verified" | "rejected";
  applicationStatus: TutorProfile["applicationStatus"];
}

export const marketplace = {
  async applyAsTutor(input: {
    displayName: string;
    headline: string;
    bio?: string;
    hourlyRatePaise: number;
    qualifications: TutorQualification[];
    availability: TutorAvailability[];
    topicIds: string[];
  }): Promise<TutorProfile> {
    const res = await auth.fetch(`${env.apiBaseUrl}/marketplace/tutors/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return asJson<TutorProfile>(res);
  },

  async getMyTutorProfile(): Promise<TutorProfile | null> {
    const res = await auth.fetch(`${env.apiBaseUrl}/marketplace/tutors/me`);
    if (res.status === 404) return null;
    return asJson<TutorProfile>(res);
  },

  async startKyc(): Promise<KycStartOut> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/tutors/me/kyc/start`,
      { method: "POST" },
    );
    return asJson<KycStartOut>(res);
  },

  async pollKyc(force?: "rejected" | "pending"): Promise<KycPollOut> {
    const qs = force ? `?force=${force}` : "";
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/tutors/me/kyc/poll${qs}`,
      { method: "POST" },
    );
    return asJson<KycPollOut>(res);
  },

  async activate(): Promise<TutorProfile> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/tutors/me/activate`,
      { method: "POST" },
    );
    return asJson<TutorProfile>(res);
  },
};

// ── Sprint 18 (P3-S3) — Creator marketplace + courses ────────────────

export interface CreatorProfile {
  userId: string;
  displayName: string;
  headline: string;
  bio: string;
  tier: string;
  applicationStatus:
    | "APPLIED" | "KYC_PENDING" | "KYC_VERIFIED"
    | "APPROVED" | "ACTIVE" | "REJECTED" | "SUSPENDED";
  kycStatus: string | null;
  appliedAt: string;
  approvedAt: string | null;
}

export interface Course {
  id: string;
  creatorUserId: string;
  title: string;
  description: string;
  contentMd: string;
  pricePaise: number;
  tier: "FREE" | "STANDARD" | "PREMIUM";
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "RETIRED";
  coverImageUrl: string | null;
  examId: string | null;
  subjectId: string | null;
  topicIds: string[];
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string;
}

export const creator = {
  async apply(input: {
    displayName: string;
    headline: string;
    bio?: string;
  }): Promise<CreatorProfile> {
    const res = await auth.fetch(`${env.apiBaseUrl}/marketplace/creators/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return asJson<CreatorProfile>(res);
  },

  async me(): Promise<CreatorProfile | null> {
    const res = await auth.fetch(`${env.apiBaseUrl}/marketplace/creators/me`);
    if (res.status === 404) return null;
    return asJson<CreatorProfile>(res);
  },

  async startKyc(): Promise<{ sessionId: string }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/creators/me/kyc/start`,
      { method: "POST" },
    );
    return asJson(res);
  },

  async pollKyc(): Promise<{ applicationStatus: string; status: string }> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/creators/me/kyc/poll`,
      { method: "POST" },
    );
    return asJson(res);
  },

  async activate(): Promise<CreatorProfile> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/creators/me/activate`,
      { method: "POST" },
    );
    return asJson<CreatorProfile>(res);
  },
};

export const courseAuthoring = {
  async create(input: {
    title: string;
    description: string;
    contentMd: string;
    pricePaise: number;
    tier?: "FREE" | "STANDARD" | "PREMIUM";
    coverImageUrl?: string | null;
    examId?: string | null;
    subjectId?: string | null;
    topicIds?: string[];
  }): Promise<Course> {
    const res = await auth.fetch(`${env.apiBaseUrl}/marketplace/courses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier: "STANDARD", topicIds: [], ...input }),
    });
    return asJson<Course>(res);
  },

  async patch(courseId: string, input: Partial<Course>): Promise<Course> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    return asJson<Course>(res);
  },

  async submit(courseId: string): Promise<Course> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}/submit-for-review`,
      { method: "POST" },
    );
    return asJson<Course>(res);
  },

  async retire(courseId: string): Promise<Course> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}/retire`,
      { method: "POST" },
    );
    return asJson<Course>(res);
  },

  async myCourses(): Promise<Course[]> {
    const res = await auth.fetch(`${env.apiBaseUrl}/marketplace/creators/me/courses`);
    return asJson<Course[]>(res);
  },

  async get(courseId: string): Promise<Course> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}`,
    );
    return asJson<Course>(res);
  },
};
