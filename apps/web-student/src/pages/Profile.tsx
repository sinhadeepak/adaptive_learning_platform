// Profile — production-grade redesign (2026-05-11).
//
// Layout: pg-shell → identity hero (avatar + name + actions) →
// pg-stat-strip (streak / exams / topics / language) → pg-2col with
// main column carrying Account + Preferences (pg-section + pg-fields)
// and aside column carrying My exams + achievements/heatmap. The dense
// two-column grid replaces the previous full-width stack which left
// huge empty bands of background.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { AppShell } from "../components/AppShell";
import { setCachedAvatar } from "../lib/avatar";
import { Banner, SkeletonRows } from "../components/dashboard";
import { LeaderboardOptIn } from "../components/LeaderboardOptIn";
import { RealExamReport } from "../components/RealExamReport";

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

function daysUntil(iso: string | null): { label: string; tone: "info" | "warn" | "danger" | "muted" } {
  if (!iso) return { label: "No target date", tone: "muted" };
  const d = new Date(iso);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: `${-days} days past`, tone: "muted" };
  if (days === 0) return { label: "Today!", tone: "danger" };
  if (days < 30) return { label: `${days} days left`, tone: "danger" };
  if (days < 90) return { label: `${days} days left`, tone: "warn" };
  return { label: `${days} days left`, tone: "info" };
}

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
        <div className="pg-shell">
          <Banner tone="danger" role="alert">{error}</Banner>
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Profile">
        <div className="pg-shell">
          <SkeletonRows count={3} />
        </div>
      </AppShell>
    );
  }

  const user = profile.user;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Learner";
  const initial = (user.firstName || "?").slice(0, 1).toUpperCase();
  const verified = !!user.emailVerifiedAt;

  return (
    <AppShell title="Profile">
      <div className="pg-shell">
        {/* ── Identity strip ────────────────────────────────────── */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            paddingBottom: 22,
            marginBottom: 22,
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <label
            htmlFor="avatar-input"
            title={profile.avatarUrl ? "Replace avatar" : "Upload avatar"}
            style={{
              position: "relative",
              width: 82,
              height: 82,
              borderRadius: "50%",
              background: profile.avatarUrl
                ? `center/cover url(${profile.avatarUrl})`
                : "linear-gradient(135deg, var(--info), var(--accent))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 800,
              color: "#fff",
              fontFamily: "var(--font-display)",
              cursor: avatarBusy ? "wait" : "pointer",
              overflow: "hidden",
              flexShrink: 0,
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
                background: "var(--info)",
                color: "#fff",
                width: 26,
                height: 26,
                borderRadius: "50%",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid var(--paper)",
              }}
              aria-hidden
            >
              {avatarBusy ? "…" : "✎"}
            </span>
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: "var(--ink)",
                letterSpacing: "-0.01em",
              }}
            >
              {fullName}
            </h1>
            <p style={{ margin: "4px 0 8px", fontSize: 13, color: "var(--ink-3)" }}>
              {user.email}
              {user.phone ? ` · ${user.phone}` : ""}
              {" · "}
              {verified ? (
                <span style={{ color: "var(--good)" }}>✓ Verified</span>
              ) : (
                <span style={{ color: "var(--warn)" }}>Email pending</span>
              )}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link to="/settings" className="pg-btn pg-btn-subtle pg-btn-sm">
                ⚙ Settings
              </Link>
              {profile.avatarUrl && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={avatarBusy}
                  className="pg-btn pg-btn-ghost pg-btn-sm"
                >
                  Remove avatar
                </button>
              )}
              <button
                type="button"
                className="pg-btn pg-btn-ghost pg-btn-sm"
                onClick={() => void logout()}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* ── KPI strip ─────────────────────────────────────────── */}
        <div className="pg-stat-strip">
          <div className="pg-stat">
            <div className="pg-stat-label">Current streak</div>
            <div className="pg-stat-value" style={{ color: "var(--warn)" }}>
              {streak?.currentStreak ?? 0}🔥
            </div>
            <div className="pg-stat-delta">
              best {streak?.longestStreak ?? 0} day{streak?.longestStreak === 1 ? "" : "s"}
            </div>
          </div>
          <div className="pg-stat">
            <div className="pg-stat-label">Active exams</div>
            <div className="pg-stat-value" style={{ color: "var(--info)" }}>
              {profile.exams.length}
            </div>
            <div className="pg-stat-delta">
              {profile.exams.length === 0 ? "pick one to get started" : "tracked below"}
            </div>
          </div>
          <div className="pg-stat">
            <div className="pg-stat-label">Topics in motion</div>
            <div className="pg-stat-value" style={{ color: "var(--good)" }}>
              {topicsTracked ?? 0}
            </div>
            <div className="pg-stat-delta">analytics-tracked</div>
          </div>
          <div className="pg-stat">
            <div className="pg-stat-label">Achievements</div>
            <div className="pg-stat-value" style={{ color: "var(--accent)" }}>
              {achievements.length}
            </div>
            <div className="pg-stat-delta">
              {achievements.length === 0 ? "earn your first badge" : "unlocked"}
            </div>
          </div>
        </div>

        {/* ── Two-column body ───────────────────────────────────── */}
        <div className="pg-2col">
          <div>
            <section className="pg-section">
              <h2 className="pg-section-title">
                Account
                {!verified && (
                  <button
                    type="button"
                    className="pg-btn pg-btn-subtle pg-btn-sm"
                    onClick={async () => {
                      try {
                        await auth.fetch("/api/v1/auth/resend-verification", {
                          method: "POST",
                        });
                        alert("Verification email resent.");
                      } catch {
                        alert("Couldn't send right now.");
                      }
                    }}
                  >
                    Resend verification
                  </button>
                )}
              </h2>
              <div className="pg-fields">
                <div>
                  <div className="pg-field-label">Full name</div>
                  <div className="pg-field-value">{fullName}</div>
                </div>
                <div>
                  <div className="pg-field-label">Email</div>
                  <div className="pg-field-value">{user.email}</div>
                </div>
                <div>
                  <div className="pg-field-label">Phone</div>
                  <div className={user.phone ? "pg-field-value" : "pg-field-value pg-field-value-empty"}>
                    {user.phone ?? "Not set"}
                  </div>
                </div>
                <div>
                  <div className="pg-field-label">Locale</div>
                  <div className={user.locale ? "pg-field-value" : "pg-field-value pg-field-value-empty"}>
                    {user.locale ?? "Not set"}
                  </div>
                </div>
                <div>
                  <div className="pg-field-label">Member since</div>
                  <div className={user.createdAt ? "pg-field-value" : "pg-field-value pg-field-value-empty"}>
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="pg-field-label">Email verified</div>
                  <div className="pg-field-value">
                    {verified ? (
                      <span style={{ color: "var(--good)" }}>✓ Verified</span>
                    ) : (
                      <span style={{ color: "var(--warn)" }}>Pending</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="pg-section">
              <h2 className="pg-section-title">
                Preferences
                <Link to="/settings" className="pg-btn pg-btn-subtle pg-btn-sm">
                  Edit
                </Link>
              </h2>
              <div className="pg-fields">
                <div>
                  <div className="pg-field-label">Language</div>
                  <div className="pg-field-value">
                    {LANG_NAME[profile.preferences.language] ??
                      profile.preferences.language}
                  </div>
                </div>
                <div>
                  <div className="pg-field-label">Daily goal</div>
                  <div
                    className={
                      profile.preferences.dailyGoalMinutes
                        ? "pg-field-value"
                        : "pg-field-value pg-field-value-empty"
                    }
                  >
                    {profile.preferences.dailyGoalMinutes
                      ? `${profile.preferences.dailyGoalMinutes} min/day`
                      : "Not set"}
                  </div>
                </div>
                <div>
                  <div className="pg-field-label">Onboarding</div>
                  <div className="pg-field-value">
                    {user.onboardingState === "ONBOARDED" ? (
                      <span style={{ color: "var(--good)" }}>✓ Complete</span>
                    ) : user.onboardingState === "EXAM_SELECTED" ? (
                      <span style={{ color: "var(--warn)" }}>In progress</span>
                    ) : (
                      <span style={{ color: "var(--ink-3)" }}>New</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="pg-section">
              <h2 className="pg-section-title">
                Activity
                <span className="pg-section-title-sub">last 30 days</span>
              </h2>
              <ActivityHeatmap />
            </section>

            <LeaderboardOptIn />
            <RealExamReport />
          </div>

          <div>
            <section className="pg-section">
              <h2 className="pg-section-title">
                My exams
                <Link to="/onboarding/exam" className="pg-btn pg-btn-subtle pg-btn-sm">
                  Edit
                </Link>
              </h2>
              {profile.exams.length === 0 ? (
                <div style={{ padding: "8px 0" }}>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--ink-3)",
                      margin: "0 0 12px",
                      lineHeight: 1.5,
                    }}
                  >
                    Pick an exam to lock in your prep target — we'll surface
                    syllabus coverage, weak areas, and mock tests tailored to it.
                  </p>
                  <Link to="/onboarding/exam" className="pg-btn pg-btn-primary pg-btn-sm">
                    Pick an exam →
                  </Link>
                </div>
              ) : (
                <div className="pg-list">
                  {profile.exams.map((e) => {
                    const meta = examsMeta[e.examId];
                    const cd = daysUntil(e.targetDate);
                    return (
                      <Link
                        key={e.examId}
                        to={`/exams/${e.examId}`}
                        className="pg-row"
                        style={{ padding: "10px 12px" }}
                      >
                        <div className="pg-row-main">
                          <p className="pg-row-title" style={{ fontSize: 13 }}>
                            {meta?.name ?? "Exam"}
                          </p>
                          <div className="pg-row-meta">
                            <span>{meta?.subtitle ?? "Prep target"}</span>
                            {e.targetDate && (
                              <>
                                <span className="pg-row-meta-dot">·</span>
                                <span>
                                  {new Date(e.targetDate).toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className={`pg-pill pg-pill-${cd.tone}`}>{cd.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="pg-section">
              <h2 className="pg-section-title">
                Achievements
                <span className="pg-section-title-sub">{achievements.length} earned</span>
              </h2>
              {achievements.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: achievements.length > 0 ? 12 : 0,
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
                          gap: 6,
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: meta.bg,
                          border: `1px solid ${meta.border}`,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{meta.icon}</span>
                        <span style={{ color: "var(--ink)", fontSize: 12, fontWeight: 600 }}>
                          {meta.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
                  No badges yet — start practicing to unlock the first one.
                </p>
              )}
              {(() => {
                const earned = new Set(achievements.map((a) => a.kind));
                const locked = ALL_BADGE_KINDS.filter((k) => !earned.has(k.kind)).slice(0, 3);
                if (locked.length === 0) return null;
                return (
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--ink-4)",
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        marginBottom: 6,
                      }}
                    >
                      Up next
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {locked.map((meta) => (
                        <div
                          key={meta.kind}
                          title="Keep going to unlock"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: "var(--paper-2)",
                            border: "1px dashed var(--rule)",
                            opacity: 0.55,
                          }}
                        >
                          <span style={{ fontSize: 14, filter: "grayscale(0.8)" }}>{meta.icon}</span>
                          <span style={{ color: "var(--ink-3)", fontSize: 12, fontWeight: 500 }}>
                            {meta.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

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
    return { icon: "🎯", label: "First session", bg: "rgba(99,102,241,0.10)", border: "rgba(99,102,241,0.40)" };
  }
  if (a.kind === "daily_goal_first") {
    return { icon: "✓", label: "Daily goal hit", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.40)" };
  }
  if (a.kind === "mock_first") {
    return { icon: "🎓", label: "First mock test", bg: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.40)" };
  }
  if (a.kind.startsWith("mocks_")) {
    const n = parseInt(a.kind.slice("mocks_".length), 10) || 0;
    return { icon: "🎓", label: `${n} mock tests`, bg: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.40)" };
  }
  if (a.kind.startsWith("sessions_")) {
    const n = parseInt(a.kind.slice("sessions_".length), 10) || 0;
    return { icon: "📚", label: `${n} sessions`, bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.40)" };
  }
  if (a.kind.startsWith("questions_")) {
    const n = parseInt(a.kind.slice("questions_".length), 10) || 0;
    return { icon: "❓", label: `${n} questions answered`, bg: "rgba(99,102,241,0.10)", border: "rgba(99,102,241,0.40)" };
  }
  return { icon: "🏆", label: a.kind.replace(/_/g, " "), bg: "rgba(99,102,241,0.10)", border: "rgba(99,102,241,0.40)" };
}

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