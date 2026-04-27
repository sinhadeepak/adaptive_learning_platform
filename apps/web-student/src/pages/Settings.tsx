import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/dashboard";

// ─────────────────────────────────────────────────────────────────────────
// Settings — manage preferences (language, daily goal) + account actions.
// Reached from sidebar "Settings" item or Profile screen.
// Mirrors the AI-first dashboard chrome: gradient hero + section cards.
// ─────────────────────────────────────────────────────────────────────────

interface ProfileResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName?: string;
    phone?: string | null;
  };
  preferences: { language: string; dailyGoalMinutes: number | null };
  exams: Array<{ examId: string; targetDate: string | null }>;
  notificationPrefs?: Record<string, boolean>;
}

interface NotifKind {
  id: string;
  label: string;
  description: string;
}

const NOTIF_KINDS: NotifKind[] = [
  {
    id: "quiz.completed",
    label: "Practice results",
    description: "Bell ping when a practice session is scored.",
  },
  {
    id: "mock.completed",
    label: "Mock test results",
    description: "Bell ping when an AI mock test is scored, with projected AIR.",
  },
  {
    id: "streak.milestone",
    label: "Streak milestones",
    description: "🔥 3 / 7 / 14 / 30 / 60 / 100 / 365-day streak hits.",
  },
  {
    id: "streak.broken",
    label: "Streak reset",
    description: "When you return after missing a day and the streak resets.",
  },
  {
    id: "goal.reached",
    label: "Daily goal hit",
    description: "When the day's study minutes cross your goal.",
  },
  {
    id: "doubt.answered",
    label: "Doubt replies",
    description: "When an expert or AI tutor replies to a thread you started.",
  },
  {
    id: "achievement.unlocked",
    label: "Achievements",
    description: "Bell ping the first time you unlock a new badge.",
  },
];

type Language = "en" | "hi" | "hinglish";

const LANG_OPTIONS: Array<{ id: Language; label: string; sub: string; lang?: string }> = [
  { id: "en", label: "English", sub: "Default. All content available." },
  { id: "hi", label: "हिन्दी", sub: "Hindi content rolls out from Sprint 2.", lang: "hi" },
  { id: "hinglish", label: "Hinglish", sub: "Type either; we understand both." },
];

const GOAL_OPTIONS = [
  { minutes: 15, label: "Chill — 15 min/day" },
  { minutes: 30, label: "Regular — 30 min/day" },
  { minutes: 60, label: "Serious — 60 min/day" },
  { minutes: 120, label: "Intense — 120 min/day" },
];

export function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [goal, setGoal] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});

  function isMuted(type: string): boolean {
    return notifPrefs[type] === false;
  }

  async function toggleNotifType(type: string) {
    const next = !isMuted(type) ? false : true; // if muted, enable; else mute
    const optimistic = { ...notifPrefs, [type]: next };
    setNotifPrefs(optimistic);
    const r = await auth.fetch(`/api/v1/profile/notification-prefs`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefs: { [type]: next } }),
    });
    if (!r.ok) {
      // Roll back.
      setNotifPrefs(notifPrefs);
    } else {
      const body = (await r.json()) as ProfileResponse;
      setNotifPrefs(body.notificationPrefs ?? optimistic);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as ProfileResponse;
        setProfile(body);
        if (body.preferences.language) {
          setLanguage(body.preferences.language as Language);
        }
        if (body.preferences.dailyGoalMinutes) {
          setGoal(body.preferences.dailyGoalMinutes);
        }
        if (body.notificationPrefs) {
          setNotifPrefs(body.notificationPrefs);
        }
      } catch {
        setError("We couldn't load your settings.");
      }
    })();
  }, []);

  async function savePreferences() {
    setError(null);
    setSaving(true);
    try {
      const r = await auth.fetch("/api/v1/profile/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          language,
          dailyGoalMinutes: goal,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 3000);
    } catch {
      setError("We couldn't save your preferences. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  if (error && !profile) {
    return (
      <AppShell title="Settings">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Settings">
        <SkeletonRows count={3} />
      </AppShell>
    );
  }

  const dirty =
    language !== (profile.preferences.language ?? "en") ||
    goal !== (profile.preferences.dailyGoalMinutes ?? 30);

  return (
    <AppShell title="Settings">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="ai-header" aria-label="Settings">
        <div className="ai-header-left">
          <span className="ai-pill">◈ ACCOUNT &amp; PREFERENCES</span>
          <h1 className="ai-header-name">Settings</h1>
          <p className="ai-header-sub">
            Tune the language you study in, your daily-goal cadence, and your
            account. Changes save manually so you can preview before
            committing.
          </p>
          <div className="ai-header-btns">
            <Link to="/profile" className="btn btn-ghost">
              ← Back to profile
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        </div>
      ) : null}

      {savedAt ? (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <Banner tone="success" role="status">
            Preferences saved.
          </Banner>
        </div>
      ) : null}

      <div style={{ marginTop: "var(--sp-5)" }}>
        {/* ── Language ─────────────────────────────────────────── */}
        <section className="topic-section">
          <h2 className="topic-section-title">Study language</h2>
          <p className="topic-section-body" style={{ marginBottom: "var(--sp-3)" }}>
            The IRT engine works in any of these. You can switch any time.
          </p>
          <div role="radiogroup" aria-label="Study language" className="option-list">
            {LANG_OPTIONS.map((opt) => {
              const isSelected = language === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setLanguage(opt.id)}
                  className={`option-card ${isSelected ? "option-card-selected" : ""}`.trim()}
                >
                  <div className="option-card-head">
                    <span className="option-card-title" lang={opt.lang}>
                      {opt.label}
                    </span>
                    {isSelected ? <span className="option-check">✓</span> : null}
                  </div>
                  <p className="option-card-sub">{opt.sub}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Daily goal ──────────────────────────────────────── */}
        <section className="topic-section">
          <h2 className="topic-section-title">Daily goal</h2>
          <p className="topic-section-body" style={{ marginBottom: "var(--sp-3)" }}>
            How many minutes do you want to study per day? Streaks count days
            where you hit at least 4× per week.
          </p>
          <div role="radiogroup" aria-label="Daily goal" className="option-list">
            {GOAL_OPTIONS.map((opt) => {
              const isSelected = goal === opt.minutes;
              return (
                <button
                  key={opt.minutes}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setGoal(opt.minutes)}
                  className={`option-card ${isSelected ? "option-card-selected" : ""}`.trim()}
                >
                  <div className="option-card-head">
                    <span className="option-card-title">{opt.label}</span>
                    {isSelected ? <span className="option-check">✓</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Notifications ────────────────────────────────────── */}
        <section className="topic-section">
          <h2 className="topic-section-title">Notifications</h2>
          <p className="topic-section-body" style={{ marginBottom: "var(--sp-3)" }}>
            Mute the categories you don't want pinging your inbox bell.
            Changes take effect for future events; already-delivered
            notifications stay in your inbox until you mark them read.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {NOTIF_KINDS.map((kind) => {
              const muted = isMuted(kind.id);
              return (
                <li
                  key={kind.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "var(--sp-3)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 10,
                    background: "var(--bg-surface-1)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {kind.label}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      {kind.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleNotifType(kind.id)}
                    aria-pressed={!muted}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 999,
                      background: muted ? "var(--bg-surface-3)" : "var(--color-blue)",
                      border: "1px solid var(--border-default)",
                      cursor: "pointer",
                      position: "relative",
                      transition: "background 0.15s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 1,
                        left: muted ? 1 : 21,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 0.15s",
                      }}
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Save bar ─────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginBottom: "var(--sp-5)",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!dirty || saving}
            onClick={() => {
              setLanguage((profile.preferences.language as Language) ?? "en");
              setGoal(profile.preferences.dailyGoalMinutes ?? 30);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty || saving}
            onClick={savePreferences}
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
        </div>

        {/* ── Account actions ──────────────────────────────────── */}
        <section className="topic-section">
          <h2 className="topic-section-title">Account</h2>
          <dl className="kv-list" style={{ padding: 0, gap: "var(--sp-5)" }}>
            <div>
              <dt>Email</dt>
              <dd>{profile.user.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{profile.user.phone ?? "—"}</dd>
            </div>
          </dl>
          <div style={{ display: "flex", gap: 8, marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
            <Link
              to="/forgot-password"
              className="btn btn-ghost"
            >
              Change password
            </Link>
          </div>
        </section>

        {/* ── Onboarding link if not done ──────────────────────── */}
        {profile.exams.length === 0 ? (
          <section className="topic-section">
            <h2 className="topic-section-title">Onboarding</h2>
            <p className="topic-section-body">
              You haven't picked an exam yet.{" "}
              <Link to="/onboarding/exam" className="auth-link">
                Pick one →
              </Link>
            </p>
          </section>
        ) : null}

        {/* ── Sign-out (danger zone) ───────────────────────────── */}
        <section
          className="topic-section"
          style={{ borderColor: "rgba(244,63,94,0.18)" }}
        >
          <h2
            className="topic-section-title"
            style={{ color: "var(--color-red)" }}
          >
            Sign out
          </h2>
          <p className="topic-section-body" style={{ marginBottom: "var(--sp-3)" }}>
            Signs you out on this browser. Your session token is invalidated
            on the server immediately.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            style={{
              borderColor: "rgba(244,63,94,0.32)",
              color: "var(--color-red)",
            }}
          >
            {signingOut ? "Signing out…" : "Sign out of this device"}
          </button>
        </section>
      </div>
    </AppShell>
  );
}
