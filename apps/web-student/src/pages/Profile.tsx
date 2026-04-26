import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

// ─────────────────────────────────────────────────────────────────────────
// Profile — the "your account" overview screen.
// Reached from the sidebar avatar / footer or the Profile nav item.
// Mirrors the AI-first dashboard chrome (PRs #56-61): gradient hero +
// stat tiles + content cards.
// ─────────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string | null;
  role?: string;
  locale?: string;
  onboardingState?: "NEW" | "EXAM_SELECTED" | "ONBOARDED";
  emailVerifiedAt?: string | null;
  createdAt?: string | null;
}

interface ProfileExam {
  examId: string;
  examName?: string;
  targetDate: string | null;
}

interface ProfileResponse {
  user: User;
  preferences: { language: string; dailyGoalMinutes: number | null };
  exams: ProfileExam[];
}

interface ExamMeta {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
}

interface StreakResponse {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

interface MasteryListResponse {
  userId: string;
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

const LANG_NAME: Record<string, string> = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  hinglish: "Hinglish",
};

export function Profile() {
  const { user: authUser, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [examsMeta, setExamsMeta] = useState<Record<string, ExamMeta>>({});
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [topicsTracked, setTopicsTracked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setProfile((await r.json()) as ProfileResponse);
      } catch {
        setError("We couldn't load your profile.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (r.ok) {
          const all = (await r.json()) as ExamMeta[];
          const map: Record<string, ExamMeta> = {};
          all.forEach((e) => {
            map[e.id] = e;
          });
          setExamsMeta(map);
        }
      } catch {
        /* swallow */
      }
    })();
  }, [profile]);

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/streak/${authUser.id}`);
        if (r.ok) setStreak((await r.json()) as StreakResponse);
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${authUser.id}`);
        if (r.ok) {
          const body = (await r.json()) as MasteryListResponse;
          setTopicsTracked(body.topics.filter((t) => t.ewa > 0).length);
        }
      } catch {
        /* swallow */
      }
    })();
  }, [authUser]);

  if (error) {
    return (
      <AppShell title="Profile">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Profile">
        <SkeletonRows count={3} />
      </AppShell>
    );
  }

  const user = profile.user;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Learner";
  const initial = (user.firstName || "?").slice(0, 1).toUpperCase();
  const onboardingPill =
    user.onboardingState === "ONBOARDED"
      ? { tone: "success" as const, label: "Onboarded" }
      : user.onboardingState === "EXAM_SELECTED"
        ? { tone: "warning" as const, label: "In progress" }
        : { tone: "info" as const, label: "New" };

  return (
    <AppShell title="Profile">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="ai-header" aria-label="Profile">
        <div className="ai-header-left">
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 4,
            }}
          >
            <span className="ai-pill">◈ ADAPTIVELEARN PROFILE</span>
            <Pill tone={onboardingPill.tone}>{onboardingPill.label}</Pill>
            {user.role ? <Pill tone="muted">{user.role}</Pill> : null}
          </div>
          <h1 className="ai-header-name">
            <span className="ai-header-name-accent">{fullName}</span>
          </h1>
          <p className="ai-header-sub">
            <strong>{user.email}</strong>
            {user.phone ? ` · ${user.phone}` : ""} ·{" "}
            {user.emailVerifiedAt ? "Email verified" : "Email pending verification"}
          </p>
          <div className="ai-header-btns">
            <Link to="/settings" className="btn-ai">
              ◈ Settings
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="ai-header-stats" style={{ alignItems: "center" }}>
          <div
            style={{
              width: 90,
              height: 90,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, var(--color-blue), var(--color-purple))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 800,
              color: "#fff",
              fontFamily: "var(--font-display)",
            }}
            aria-hidden
          >
            {initial}
          </div>
        </div>
      </section>

      {/* ── Stat tiles ─────────────────────────────────────────── */}
      <section
        className="topic-stats"
        style={{ marginTop: "var(--sp-4)" }}
        aria-label="Profile stats"
      >
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-amber)" }}>
            {streak?.currentStreak ?? 0} 🔥
          </div>
          <div className="topic-stat-lbl">Current streak</div>
          <div className="topic-stat-foot">
            best: {streak?.longestStreak ?? 0} day{streak?.longestStreak === 1 ? "" : "s"}
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-blue)" }}>
            {profile.exams.length}
          </div>
          <div className="topic-stat-lbl">Active exams</div>
          <div className="topic-stat-foot">
            {profile.exams.length === 0 ? "none yet" : "tracked"}
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-green)" }}>
            {topicsTracked ?? 0}
          </div>
          <div className="topic-stat-lbl">Topics in motion</div>
          <div className="topic-stat-foot">analytics-tracked</div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-ai)" }}>
            {LANG_NAME[profile.preferences.language] ?? profile.preferences.language}
          </div>
          <div className="topic-stat-lbl">Language</div>
          <div className="topic-stat-foot">change in settings</div>
        </div>
      </section>

      {/* ── Sections ───────────────────────────────────────────── */}
      <div style={{ marginTop: "var(--sp-5)" }}>
        <section className="topic-section">
          <h2 className="topic-section-title">Account</h2>
          <dl className="kv-list" style={{ padding: 0, gap: "var(--sp-5)" }}>
            <div>
              <dt>Full name</dt>
              <dd>{fullName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{user.phone ?? "—"}</dd>
            </div>
            <div>
              <dt>Locale</dt>
              <dd>{user.locale ?? "—"}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Email verified</dt>
              <dd>{user.emailVerifiedAt ? "Yes" : "Pending"}</dd>
            </div>
          </dl>
        </section>

        <section className="topic-section">
          <h2 className="topic-section-title">My exams</h2>
          {profile.exams.length === 0 ? (
            <p className="topic-section-body">
              You haven't picked an exam yet.{" "}
              <Link to="/onboarding/exam" className="auth-link">
                Pick one →
              </Link>
            </p>
          ) : (
            <ul className="row-list">
              {profile.exams.map((e) => {
                const meta = examsMeta[e.examId];
                return (
                  <li key={e.examId}>
                    <Link to={`/exams/${e.examId}`} className="row-link">
                      <div className="row-link-body">
                        <p className="row-link-title">
                          {meta?.name ?? "Exam"}
                        </p>
                        <p className="row-link-meta">
                          {meta?.subtitle ?? "Prep target"}
                          {e.targetDate
                            ? ` · target ${new Date(e.targetDate).toLocaleDateString()}`
                            : " · no target date"}
                        </p>
                      </div>
                      <span className="chevron" aria-hidden>
                        ›
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="topic-section">
          <h2 className="topic-section-title">Preferences</h2>
          <dl className="kv-list" style={{ padding: 0, gap: "var(--sp-5)" }}>
            <div>
              <dt>Language</dt>
              <dd>
                {LANG_NAME[profile.preferences.language] ??
                  profile.preferences.language}
              </dd>
            </div>
            <div>
              <dt>Daily goal</dt>
              <dd>
                {profile.preferences.dailyGoalMinutes
                  ? `${profile.preferences.dailyGoalMinutes} min/day`
                  : "not set"}
              </dd>
            </div>
            <div>
              <dt>Onboarding</dt>
              <dd>{user.onboardingState ?? "—"}</dd>
            </div>
          </dl>
          <div style={{ display: "flex", gap: 8, marginTop: "var(--sp-3)" }}>
            <Link to="/settings" className="btn btn-primary">
              Edit preferences
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
