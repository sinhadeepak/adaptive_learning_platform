import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { AppShell } from "../components/AppShell";
import { setCachedAvatar } from "../lib/avatar";
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
  avatarUrl?: string | null;
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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [achievements, setAchievements] = useState<Array<{
    id: string;
    kind: string;
    payload: Record<string, unknown>;
    awardedAt: string;
  }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/profile/achievements`);
        if (!r.ok) return;
        const body = (await r.json()) as { items: typeof achievements };
        setAchievements(body.items);
      } catch {/* swallow */}
    })();
  }, []);

  async function uploadAvatar(file: File) {
    if (!file.type.startsWith("image/")) return;
    setAvatarBusy(true);
    try {
      const dataUrl = await downscaleImage(file, 256);
      const r = await auth.fetch(`/api/v1/profile/me/avatar`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      if (r.ok) {
        const body = (await r.json()) as ProfileResponse;
        setProfile(body);
        setCachedAvatar(body.avatarUrl ?? null);
      }
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (avatarBusy) return;
    setAvatarBusy(true);
    try {
      await auth.fetch(`/api/v1/profile/me/avatar`, { method: "DELETE" });
      setProfile((p) => (p ? { ...p, avatarUrl: null } : p));
      setCachedAvatar(null);
    } finally {
      setAvatarBusy(false);
    }
  }
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
          <label
            htmlFor="avatar-input"
            title={profile.avatarUrl ? "Replace avatar" : "Upload avatar"}
            style={{
              position: "relative",
              width: 90,
              height: 90,
              borderRadius: "50%",
              background: profile.avatarUrl
                ? `center/cover url(${profile.avatarUrl})`
                : "linear-gradient(135deg, var(--color-blue), var(--color-purple))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 800,
              color: "#fff",
              fontFamily: "var(--font-display)",
              cursor: avatarBusy ? "wait" : "pointer",
              overflow: "hidden",
              border: profile.avatarUrl ? "2px solid var(--color-blue)" : "none",
            }}
          >
            {profile.avatarUrl ? null : initial}
            <input
              id="avatar-input"
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
                e.currentTarget.value = "";
              }}
              disabled={avatarBusy}
            />
            <span
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                background: "var(--color-blue)",
                color: "#fff",
                width: 26,
                height: 26,
                borderRadius: "50%",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid var(--bg-base)",
              }}
              aria-hidden
            >
              {avatarBusy ? "…" : "✎"}
            </span>
          </label>
          {profile.avatarUrl ? (
            <button
              type="button"
              onClick={removeAvatar}
              disabled={avatarBusy}
              style={{
                marginTop: 8,
                background: "transparent",
                border: 0,
                color: "var(--text-muted)",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Remove avatar
            </button>
          ) : null}
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

      {/* ── Achievements ──────────────────────────────────────── */}
      <section className="topic-section" style={{ marginTop: "var(--sp-5)" }}>
        <h2 className="topic-section-title">
          Achievements · {achievements.length}
        </h2>
        {achievements.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {achievements.map((a) => {
              const meta = badgeFor(a);
              return (
                <div
                  key={a.id}
                  title={`${meta.label} · ${new Date(a.awardedAt).toLocaleDateString()}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: meta.bg,
                    border: `1px solid ${meta.border}`,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{meta.icon}</span>
                  <span
                    style={{
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              margin: "0 0 var(--sp-3) 0",
            }}
          >
            No badges yet — start practicing to unlock the first one.
          </p>
        )}
        {(() => {
          const earned = new Set(achievements.map((a) => a.kind));
          const locked = ALL_BADGE_KINDS.filter((k) => !earned.has(k.kind)).slice(0, 4);
          if (locked.length === 0) return null;
          return (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Up next
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {locked.map((meta) => (
                  <div
                    key={meta.kind}
                    title="Keep going to unlock"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 999,
                      background: "var(--bg-surface-1)",
                      border: "1px dashed var(--border-default)",
                      opacity: 0.55,
                    }}
                  >
                    <span style={{ fontSize: 18, filter: "grayscale(0.8)" }}>{meta.icon}</span>
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </section>

      {/* ── Activity heatmap ───────────────────────────────────── */}
      <section className="topic-section" style={{ marginTop: "var(--sp-5)" }}>
        <h2 className="topic-section-title">Activity · last 30 days</h2>
        <ActivityHeatmap />
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

// Static catalog of every badge kind the platform can award. The "Up next"
// section subtracts the user's earned set from this list to show what's
// available to chase. Order matters — early entries are typically the
// easiest to earn so they show first when a new student lands.
const ALL_BADGE_KINDS: Array<{ kind: string; label: string; icon: string }> = [
  { kind: "first_session", label: "First session", icon: "🎯" },
  { kind: "streak_3", label: "3-day streak", icon: "🔥" },
  { kind: "daily_goal_first", label: "Daily goal hit", icon: "✓" },
  { kind: "mock_first", label: "First mock test", icon: "🎓" },
  { kind: "sessions_10", label: "10 sessions", icon: "📚" },
  { kind: "streak_7", label: "7-day streak", icon: "🔥" },
  { kind: "questions_50", label: "50 questions answered", icon: "❓" },
  { kind: "mocks_5", label: "5 mock tests", icon: "🎓" },
  { kind: "sessions_50", label: "50 sessions", icon: "📚" },
  { kind: "streak_14", label: "14-day streak", icon: "🔥" },
  { kind: "questions_250", label: "250 questions answered", icon: "❓" },
  { kind: "streak_30", label: "30-day streak", icon: "🔥" },
  { kind: "sessions_100", label: "100 sessions", icon: "📚" },
  { kind: "mocks_10", label: "10 mock tests", icon: "🎓" },
  { kind: "questions_1000", label: "1,000 questions answered", icon: "❓" },
  { kind: "streak_60", label: "60-day streak", icon: "🔥" },
  { kind: "streak_100", label: "100-day streak", icon: "🔥" },
  { kind: "mocks_25", label: "25 mock tests", icon: "🎓" },
  { kind: "sessions_500", label: "500 sessions", icon: "📚" },
  { kind: "questions_5000", label: "5,000 questions answered", icon: "❓" },
  { kind: "streak_365", label: "365-day streak", icon: "🔥" },
];

function badgeFor(a: {
  kind: string;
  payload: Record<string, unknown>;
}): { icon: string; label: string; bg: string; border: string } {
  const days =
    typeof a.payload?.days === "number" ? (a.payload.days as number) : null;
  if (a.kind.startsWith("streak_") && days !== null) {
    return {
      icon: "🔥",
      label: `${days}-day streak`,
      bg: "rgba(245,166,35,0.10)",
      border: "rgba(245,166,35,0.40)",
    };
  }
  if (a.kind === "first_session") {
    return {
      icon: "🎯",
      label: "First session",
      bg: "rgba(99,102,241,0.10)",
      border: "rgba(99,102,241,0.40)",
    };
  }
  if (a.kind === "daily_goal_first") {
    return {
      icon: "✓",
      label: "Daily goal hit",
      bg: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.40)",
    };
  }
  if (a.kind === "mock_first") {
    return {
      icon: "🎓",
      label: "First mock test",
      bg: "rgba(168,85,247,0.10)",
      border: "rgba(168,85,247,0.40)",
    };
  }
  if (a.kind.startsWith("mocks_")) {
    const n = parseInt(a.kind.slice("mocks_".length), 10) || 0;
    return {
      icon: "🎓",
      label: `${n} mock tests`,
      bg: "rgba(168,85,247,0.10)",
      border: "rgba(168,85,247,0.40)",
    };
  }
  if (a.kind.startsWith("sessions_")) {
    const n = parseInt(a.kind.slice("sessions_".length), 10) || 0;
    return {
      icon: "📚",
      label: `${n} sessions`,
      bg: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.40)",
    };
  }
  if (a.kind.startsWith("questions_")) {
    const n = parseInt(a.kind.slice("questions_".length), 10) || 0;
    return {
      icon: "❓",
      label: `${n} questions answered`,
      bg: "rgba(99,102,241,0.10)",
      border: "rgba(99,102,241,0.40)",
    };
  }
  return {
    icon: "🏆",
    label: a.kind.replace(/_/g, " "),
    bg: "rgba(99,102,241,0.10)",
    border: "rgba(99,102,241,0.40)",
  };
}

// Client-side downscale via canvas. Caps the longest edge to `maxEdge`,
// preserves aspect ratio, and re-encodes as JPEG @ 0.85 quality so the
// resulting data URL stays under the backend's 400KB cap.
async function downscaleImage(file: File, maxEdge: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d ctx unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
