// Profile — Vidya v1 rewrite (2026-05-17).
//
// Spec: docs/02-design/design-system/04_components.md §04.a
//       + Vidya v1 mockup — Account · Profile.
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout:
//   ┌─ topbar: ACCOUNT · PROFILE / "Your profile" / ... ─────────┐
//   │  ┌── hero card: identity (avatar, name, email, actions) ───┐
//   │  └──────────────────────────────────────────────────────────┘
//   │  ┌── exams card ──────────┐ ┌── stats card ───────────────┐
//   │  └────────────────────────┘ └────────────────────────────┘
//   │  ┌── achievements card ─────────────────────────────────────┐
//   │  └──────────────────────────────────────────────────────────┘
//   │  ┌── account + preferences card ───────────────────────────┐
//   │  └──────────────────────────────────────────────────────────┘

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { setCachedAvatar } from "../lib/avatar";
import { VidyaShell } from "../components/vidya/VidyaShell";

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
      <VidyaShell
        crumbs="ACCOUNT · PROFILE"
        title="Your profile"
        subtitle="Snapshot of who you are on ALP"
      >
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <span className="vidya-card-block__title">Error</span>
          </div>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </section>
      </VidyaShell>
    );
  }

  if (!profile) {
    return (
      <VidyaShell
        crumbs="ACCOUNT · PROFILE"
        title="Your profile"
        subtitle="Snapshot of who you are on ALP"
      >
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <span className="vidya-card-block__title">Loading…</span>
          </div>
          <p style={{ color: "var(--ink-3)", margin: 0 }}>Fetching your profile…</p>
        </section>
      </VidyaShell>
    );
  }

  const user = profile.user;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Learner";
  const initial = (user.firstName || "?").slice(0, 1).toUpperCase();
  const verified = !!user.emailVerifiedAt;

  return (
    <VidyaShell
      crumbs="ACCOUNT · PROFILE"
      title="Your profile"
      subtitle="Snapshot of who you are on ALP"
      actions={
        <button
          type="button"
          className="vidya-shell__chip"
          onClick={() => void logout()}
        >
          Sign out
        </button>
      }
    >
      {/* ── HERO card — identity, avatar, upload/remove ──────────── */}
      <section className="vidya-card-block">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">Identity</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/settings" className="vidya-shell__chip">⚙ Settings</Link>
            {!verified && (
              <button
                type="button"
                className="vidya-shell__chip"
                onClick={async () => {
                  try {
                    await auth.fetch("/api/v1/auth/resend-verification", { method: "POST" });
                    alert("Verification email resent.");
                  } catch {
                    alert("Couldn't send right now.");
                  }
                }}
              >
                Resend verification
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          {/* Avatar with upload affordance */}
          <label
            htmlFor="avatar-input"
            title={profile.avatarUrl ? "Replace avatar" : "Upload avatar"}
            style={{
              position: "relative",
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: profile.avatarUrl
                ? `center/cover url(${profile.avatarUrl})`
                : "linear-gradient(135deg, var(--info), var(--accent))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 800,
              color: "var(--paper)",
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
                color: "var(--paper)",
                width: 24,
                height: 24,
                borderRadius: "50%",
                fontSize: 12,
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

          {/* Name / email / verification / role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--ink)",
                letterSpacing: "-0.01em",
                marginBottom: 4,
              }}
            >
              {fullName}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 8 }}>
              {user.email}
              {user.phone ? ` · ${user.phone}` : ""}
              {" · "}
              {verified ? (
                <span style={{ color: "var(--good)" }}>✓ Verified</span>
              ) : (
                <span style={{ color: "var(--warn)" }}>Email pending</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  background: "var(--accent)",
                  color: "var(--paper)",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {user.role ?? "STUDENT"}
              </span>
              {profile.avatarUrl && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={avatarBusy}
                  className="vidya-shell__chip"
                >
                  Remove avatar
                </button>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ── EXAMS + STATS row ────────────────────────────────────── */}
      <div className="vidya-grid-2">
        {/* Exams card */}
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <h2 className="vidya-card-block__title">My exams</h2>
            <Link to="/onboarding/exam" className="vidya-shell__chip">
              + Add
            </Link>
          </div>
          {profile.exams.length === 0 ? (
            <div>
              <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Pick an exam to lock in your prep target.
              </p>
              <Link to="/onboarding/exam" className="vidya-shell__chip vidya-shell__chip--on">
                Pick an exam →
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {profile.exams.map((e) => {
                const meta = examsMeta[e.examId];
                const cd = daysUntil(e.targetDate);
                const toneColor =
                  cd.tone === "danger" ? "var(--bad)"
                  : cd.tone === "warn" ? "var(--warn)"
                  : cd.tone === "info" ? "var(--info)"
                  : "var(--ink-3)";
                return (
                  <Link
                    key={e.examId}
                    to={`/exams/${e.examId}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--rule)",
                      textDecoration: "none",
                      color: "var(--ink)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {meta?.name ?? e.examName ?? "Exam"}
                      </div>
                      {meta?.subtitle && (
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          {meta.subtitle}
                        </div>
                      )}
                      {e.targetDate && (
                        <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                          {new Date(e.targetDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: toneColor,
                        whiteSpace: "nowrap",
                        marginLeft: 8,
                      }}
                    >
                      {cd.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Stats card */}
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <h2 className="vidya-card-block__title">Stats</h2>
          </div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--warn)" }}>
                {streak?.currentStreak ?? 0}🔥
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Current streak</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                best {streak?.longestStreak ?? 0} day{streak?.longestStreak === 1 ? "" : "s"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--info)" }}>
                {profile.exams.length}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Active exams</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {profile.exams.length === 0 ? "pick one to get started" : "tracked above"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--good)" }}>
                {topicsTracked ?? 0}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Topics in motion</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>analytics-tracked</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>
                {achievements.length}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Achievements</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {achievements.length === 0 ? "earn your first badge" : "unlocked"}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── ACHIEVEMENTS card ─────────────────────────────────────── */}
      <section className="vidya-card-block">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">Achievements</h2>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{achievements.length} earned</span>
        </div>

        {achievements.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
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

      {/* ── ACCOUNT + PREFERENCES row ─────────────────────────────── */}
      <div className="vidya-grid-2">
        {/* Account details card */}
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <h2 className="vidya-card-block__title">Account</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Full name</div>
              <div style={{ fontSize: 13, color: "var(--ink)" }}>{fullName}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Email</div>
              <div style={{ fontSize: 13, color: "var(--ink)" }}>{user.email}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Phone</div>
              <div style={{ fontSize: 13, color: user.phone ? "var(--ink)" : "var(--ink-4)" }}>{user.phone ?? "Not set"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Member since</div>
              <div style={{ fontSize: 13, color: user.createdAt ? "var(--ink)" : "var(--ink-4)" }}>
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "—"}
              </div>
            </div>
          </div>
        </section>

        {/* Preferences card */}
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <h2 className="vidya-card-block__title">Preferences</h2>
            <Link to="/settings" className="vidya-shell__chip">Edit</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Language</div>
              <div style={{ fontSize: 13, color: "var(--ink)" }}>
                {LANG_NAME[profile.preferences.language] ?? profile.preferences.language}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Daily goal</div>
              <div style={{ fontSize: 13, color: profile.preferences.dailyGoalMinutes ? "var(--ink)" : "var(--ink-4)" }}>
                {profile.preferences.dailyGoalMinutes
                  ? `${profile.preferences.dailyGoalMinutes} min/day`
                  : "Not set"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Onboarding</div>
              <div style={{ fontSize: 13 }}>
                {user.onboardingState === "ONBOARDED" ? (
                  <span style={{ color: "var(--good)" }}>✓ Complete</span>
                ) : user.onboardingState === "EXAM_SELECTED" ? (
                  <span style={{ color: "var(--warn)" }}>In progress</span>
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>New</span>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Locale</div>
              <div style={{ fontSize: 13, color: user.locale ? "var(--ink)" : "var(--ink-4)" }}>
                {user.locale ?? "Not set"}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* TODO(profile): Recent Activity is currently an empty-state placeholder.
          Wire to /api/v1/quiz/sessions?userId=<user.id>&limit=5 (or whichever
          endpoint /history uses) in a follow-up. */}
      {/* ── RECENT ACTIVITY card ──────────────────────────────────── */}
      <section className="vidya-card-block">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">Recent activity</h2>
          <Link to="/history" className="vidya-shell__chip">View all</Link>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
          Your recent quizzes will appear here once you start practising.
        </p>
        <Link to="/practice" className="vidya-shell__chip vidya-shell__chip--on">
          Start practising →
        </Link>
      </section>
    </VidyaShell>
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

// TODO(design-system): badgeFor's rgba() literals predate the Vidya colour
// token system. Migrate to var(--warn-tint) / var(--accent-tint) etc. when
// those tokens land.
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
