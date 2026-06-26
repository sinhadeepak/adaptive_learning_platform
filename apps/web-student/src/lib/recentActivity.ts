// Recent test activity — a unified, normalized view over a student's mock
// attempts and practice sessions, used by the exam dashboard's "Recent
// tests" section. Fetch + normalize + merge live here (not the page) so the
// merge/dedup rules are unit-testable and reusable.
//
// Endpoints (both already consumed by pages/History.tsx):
//   GET /api/v1/profile/mock-attempts          -> { items: MockAttempt[] }
//   GET /api/v1/quiz/sessions?userId=<id>&limit -> { items: Session[] }
//
// Deep-link conventions match History.tsx so the existing review/result
// screens are reused.

import { auth } from "./api";

export type RecentTestKind = "mock" | "practice";
export type RecentTestStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";

export interface RecentTest {
  id: string;
  kind: RecentTestKind;
  title: string;
  topicId?: string;
  status: RecentTestStatus;
  scoreLabel: string | null; // e.g. "612 / 720" (mocks only)
  accuracyPct: number | null; // 0–100, null when nothing answered
  when: string; // ISO timestamp — used for sorting + display
  href: string; // deep-link to the review/result/resume screen
}

// Raw API shapes — only the fields we consume.
export interface RawMockAttempt {
  id: string;
  examCode?: string | null;
  examName?: string | null;
  rawScore: number;
  maxMarks: number;
  createdAt: string;
}

export interface RawSession {
  sessionId: string;
  topicId: string;
  mode: "PRACTICE" | "MOCK";
  status: RecentTestStatus;
  servedCount: number;
  correctCount: number;
  startedAt: string;
}

export function normalizeMockAttempt(a: RawMockAttempt): RecentTest {
  const accuracyPct =
    a.maxMarks > 0 ? Math.round((a.rawScore / a.maxMarks) * 100) : null;
  return {
    id: a.id,
    kind: "mock",
    title: a.examName ?? a.examCode ?? "Mock test",
    status: "SUBMITTED",
    scoreLabel: `${a.rawScore} / ${a.maxMarks}`,
    accuracyPct,
    when: a.createdAt,
    href: `/mock/result?attemptId=${a.id}`,
  };
}

export function normalizePracticeSession(s: RawSession): RecentTest {
  const accuracyPct =
    s.servedCount > 0
      ? Math.round((s.correctCount / s.servedCount) * 100)
      : null;
  const href =
    s.status === "IN_PROGRESS"
      ? `/quiz/${s.sessionId}`
      : `/quiz/${s.sessionId}/result`;
  return {
    id: s.sessionId,
    kind: "practice",
    title: "Practice",
    topicId: s.topicId,
    status: s.status,
    scoreLabel: null,
    accuracyPct,
    when: s.startedAt,
    href,
  };
}

// Mock attempts are authoritative for scored mocks; drop MOCK-mode sessions
// from quiz/sessions so they are not double-counted. Merge, sort newest
// first, slice to `limit`.
export function mergeRecent(
  mocks: RawMockAttempt[],
  sessions: RawSession[],
  limit: number,
): RecentTest[] {
  const rows: RecentTest[] = [
    ...mocks.map(normalizeMockAttempt),
    ...sessions
      .filter((s) => s.mode === "PRACTICE")
      .map(normalizePracticeSession),
  ];
  rows.sort((a, b) => Date.parse(b.when) - Date.parse(a.when));
  return rows.slice(0, limit);
}

export function relativeTime(iso: string): string {
  try {
    const delta = Date.now() - new Date(iso).getTime();
    const m = Math.floor(delta / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

async function fetchMockAttempts(): Promise<RawMockAttempt[]> {
  try {
    const r = await auth.fetch(`/api/v1/profile/mock-attempts`);
    if (!r.ok) return [];
    const body = (await r.json()) as
      | RawMockAttempt[]
      | { items?: RawMockAttempt[] | null };
    return Array.isArray(body)
      ? body
      : Array.isArray(body.items)
        ? body.items
        : [];
  } catch {
    return [];
  }
}

async function fetchSessions(userId: string): Promise<RawSession[]> {
  try {
    const r = await auth.fetch(
      `/api/v1/quiz/sessions?userId=${encodeURIComponent(userId)}&limit=100`,
    );
    if (!r.ok) return [];
    const body = (await r.json()) as { items?: RawSession[] | null };
    return Array.isArray(body.items) ? body.items : [];
  } catch {
    return [];
  }
}

export async function fetchRecentTests(
  userId: string,
  opts: { limit: number },
): Promise<RecentTest[]> {
  const [mocks, sessions] = await Promise.all([
    fetchMockAttempts(),
    fetchSessions(userId),
  ]);
  return mergeRecent(mocks, sessions, opts.limit);
}
