// Settings — Vidya v1 rewrite (2026-05-17).
//
// Spec: docs/02-design/design-system/04_components.md §04.b
//       + Vidya v1 mockup — Account · Settings.
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout:
//   ┌─ topbar: ACCOUNT · SETTINGS / "Settings" / "Preferences…" ─────┐
//   │  ┌── study language card ──────────────────────────────────────┐
//   │  └────────────────────────────────────────────────────────────┘
//   │  ┌── daily goal card ─────────────────────────────────────────┐
//   │  └────────────────────────────────────────────────────────────┘
//   │  ┌── notifications card ───────────────────────────────────────┐
//   │  └────────────────────────────────────────────────────────────┘
//   │  ┌── theme & density card ─────────────────────────────────────┐
//   │  └────────────────────────────────────────────────────────────┘
//   │  ┌── account card ─────────────────────────────────────────────┐
//   │  └────────────────────────────────────────────────────────────┘
//   │  ┌── sticky save footer ───────────────────────────────────────┐
//   │  └────────────────────────────────────────────────────────────┘

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@alp/ui";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { _resetContentLanguageCache } from "../lib/session-start";
import { useTheme, type Theme } from "../lib/theme";
import { useDensity, type Density } from "../lib/density";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { LowBandwidthToggle } from "../components/LowBandwidthToggle";

// ─────────────────────────────────────────────────────────────────────────
// Settings — manage preferences (language, daily goal) + account actions.
// Reached from sidebar "Settings" item or Profile screen.
// ─────────────────────────────────────────────────────────────────────────

interface ProfileResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName?: string;
    phone?: string | null;
  };
  preferences: { language: string; dailyGoalMinutes: number | null; contentLanguage?: string };
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
  // Sprint 11 S11-D — assignment.new mute toggle. Producers: educator
  // publishes via Content; Notification fans out via the durable
  // content.assignment.created consumer.
  {
    id: "assignment.new",
    label: "New assignments",
    description: "Bell ping when your educator publishes a new assignment to your cohort.",
  },
];

type Language = "en" | "hi" | "hinglish";

const LANG_OPTIONS: Array<{ id: Language; label: string; sub: string; lang?: string }> = [
  { id: "en", label: "English", sub: "Default. All content available." },
  { id: "hi", label: "हिन्दी", sub: "Hindi content rolls out from Sprint 2.", lang: "hi" },
  { id: "hinglish", label: "Hinglish", sub: "Type either; we understand both." },
];

type ContentLanguage = "en" | "hi" | "ta" | "te" | "bn" | "mr";

const CONTENT_LANG_OPTIONS: Array<{ id: ContentLanguage; label: string; lang?: string }> = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी", lang: "hi" },
  { id: "ta", label: "தமிழ்", lang: "ta" },
  { id: "te", label: "తెలుగు", lang: "te" },
  { id: "bn", label: "বাংলা", lang: "bn" },
  { id: "mr", label: "मराठी", lang: "mr" },
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
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>("en");
  const [goal, setGoal] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingContentLang, setSavingContentLang] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});

  function isMuted(type: string): boolean {
    return notifPrefs[type] === false;
  }

  async function toggleNotifType(type: string) {
    const next = !isMuted(type) ? false : true; // if NOT muted, mute (false); if muted, enable (true)
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
        if (body.preferences.contentLanguage) {
          setContentLanguage(body.preferences.contentLanguage as ContentLanguage);
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

  async function saveContentLanguage(lang: ContentLanguage) {
    setSavingContentLang(true);
    try {
      const r = await auth.fetch("/api/v1/profile/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentLanguage: lang }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      _resetContentLanguageCache();
    } catch {
      setError("We couldn't save your question language. Try again in a moment.");
    } finally {
      setSavingContentLang(false);
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

  const dirty =
    profile !== null &&
    (language !== (profile.preferences.language ?? "en") ||
      goal !== (profile.preferences.dailyGoalMinutes ?? 30));

  return (
    <VidyaShell
      crumbs="ACCOUNT · SETTINGS"
      title="Settings"
      subtitle="Preferences for your study experience"
    >
      {/* LOADING / ERROR STATES */}
      {error && !profile ? (
        <section className="vidya-card-block" role="alert">
          <div className="vidya-card-block__head">
            <h2 className="vidya-card-block__title">Error</h2>
          </div>
          <p style={{ color: "var(--bad)" }}>{error}</p>
        </section>
      ) : !profile ? (
        <section className="vidya-card-block" aria-busy="true">
          <div className="vidya-card-block__head">
            <h2 className="vidya-card-block__title">Loading…</h2>
          </div>
        </section>
      ) : (
        <>
          {/* Inline save/error banner */}
          {error ? (
            <p
              role="alert"
              style={{
                color: "var(--bad)",
                marginBottom: "var(--sp-3)",
                fontSize: 14,
              }}
            >
              {error}
            </p>
          ) : null}

          {/* STUDY LANGUAGE */}
          <section className="vidya-card-block">
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">Study language</h2>
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: "var(--sp-3)" }}>
              The IRT engine works in any of these. You can switch any time.
            </p>
            <div role="radiogroup" aria-label="Study language" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {LANG_OPTIONS.map((opt) => {
                const isSelected = language === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setLanguage(opt.id)}
                    className={`vidya-shell__chip${isSelected ? " vidya-shell__chip--on" : ""}`}
                    lang={opt.lang}
                    style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {opt.label}
                      {isSelected ? " ✓" : ""}
                    </span>
                    {opt.sub ? (
                      <span style={{ fontSize: 11, opacity: 0.75 }}>{opt.sub}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          {/* QUESTION LANGUAGE */}
          <section className="vidya-card-block">
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">Question language</h2>
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: "var(--sp-3)" }}>
              Questions will be delivered in this language when a translation is available. Independent of your app interface language.
            </p>
            <div role="radiogroup" aria-label="Question language" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CONTENT_LANG_OPTIONS.map((opt) => {
                const isSelected = contentLanguage === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      setContentLanguage(opt.id);
                      void saveContentLanguage(opt.id);
                    }}
                    className={`vidya-shell__chip${isSelected ? " vidya-shell__chip--on" : ""}`}
                    lang={opt.lang}
                    disabled={savingContentLang}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {opt.label}
                      {isSelected ? " ✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* DAILY GOAL */}
          <section className="vidya-card-block">
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">Daily goal</h2>
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: "var(--sp-3)" }}>
              How many minutes do you want to study per day? Streaks count days
              where you hit at least 4× per week.
            </p>
            <div role="radiogroup" aria-label="Daily goal" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {GOAL_OPTIONS.map((opt) => {
                const isSelected = goal === opt.minutes;
                return (
                  <button
                    key={opt.minutes}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setGoal(opt.minutes)}
                    className={`vidya-shell__chip${isSelected ? " vidya-shell__chip--on" : ""}`}
                  >
                    {opt.label}
                    {isSelected ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          </section>

          {/* NOTIFICATIONS */}
          <section className="vidya-card-block">
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">Notifications</h2>
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: "var(--sp-3)" }}>
              Mute the categories you don't want pinging your inbox bell.
              Changes take effect for future events; already-delivered
              notifications stay in your inbox until you mark them read.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
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
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                      background: "var(--card-1)",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                        {kind.label}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                        {kind.description}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleNotifType(kind.id)}
                      aria-pressed={!muted}
                      aria-label={`${muted ? "Enable" : "Mute"} ${kind.label}`}
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 999,
                        background: muted ? "var(--card-3)" : "var(--info)",
                        border: "1px solid var(--rule)",
                        cursor: "pointer",
                        position: "relative",
                        transition: "background 0.15s",
                        flexShrink: 0,
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
                          background: "var(--paper)",
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

          {/* THEME & DENSITY */}
          <ThemeDensitySection />

          {/* BANDWIDTH */}
          <section className="vidya-card-block" id="bandwidth">
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">Bandwidth</h2>
            </div>
            <LowBandwidthToggle />
            <p
              style={{
                marginTop: 20,
                fontSize: 12,
                color: "var(--ink-4, #7A8BAD)",
                maxWidth: 540,
                lineHeight: 1.5,
              }}
            >
              Preferences are saved on this device only. Animation reductions
              respect your system-level "reduce motion" setting automatically —
              the toggle is hidden when the OS is already requesting it.
            </p>
          </section>

          {/* ACCOUNT */}
          <section className="vidya-card-block">
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">Account</h2>
            </div>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                columnGap: "var(--sp-4)",
                rowGap: "var(--sp-2)",
                fontSize: 14,
                margin: 0,
                marginBottom: "var(--sp-3)",
              }}
            >
              <dt style={{ color: "var(--ink-3)" }}>Email</dt>
              <dd style={{ margin: 0, color: "var(--ink)" }}>{profile.user.email}</dd>
              <dt style={{ color: "var(--ink-3)" }}>Phone</dt>
              <dd style={{ margin: 0, color: "var(--ink)" }}>{profile.user.phone ?? "—"}</dd>
            </dl>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Link to="/forgot-password" className="vidya-shell__chip">
                Change password
              </Link>
              {/* Onboarding link if no exam selected */}
              {profile.exams.length === 0 ? (
                <Link to="/onboarding/exam" className="vidya-shell__chip">
                  Pick an exam →
                </Link>
              ) : null}
              {/* TODO(settings): deep-link to onboarding re-flow once multi-exam editing ships */}
            </div>
            {/* Sign-out */}
            <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--rule)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, marginBottom: "var(--sp-2)", color: "var(--bad)" }}>
                Sign out
              </h3>
              <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: "var(--sp-3)" }}>
                Signs you out on this browser. Your session token is invalidated
                on the server immediately.
              </p>
              <button
                type="button"
                className="vidya-shell__chip"
                onClick={() => void onSignOut()}
                disabled={signingOut}
                style={{ color: "var(--bad)", borderColor: "var(--bad)" }}
              >
                {signingOut ? "Signing out…" : "Sign out of this device"}
              </button>
            </div>
          </section>

          {/* STICKY SAVE FOOTER */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "16px 0",
            }}
          >
            <button
              type="button"
              className="vidya-shell__chip"
              disabled={!dirty || saving}
              onClick={() => {
                setLanguage((profile.preferences.language as Language) ?? "en");
                setGoal(profile.preferences.dailyGoalMinutes ?? 30);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="vidya-shell__chip vidya-shell__chip--on"
              onClick={savePreferences}
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : "Save preferences"}
            </button>
          </div>
          {savedAt ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 8,
                color: "var(--good)",
                fontSize: 13,
              }}
            >
              Saved
            </div>
          ) : null}
        </>
      )}
    </VidyaShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Theme & Density picker (Aurora v2 — S8).
// Lets the user switch:
//   * Theme:   system / light / dark   → `data-theme` on <html>
//   * Density: junior / aspirant / pro → `data-density` on <html>
//
// Backed by ThemeProvider + DensityProvider in src/lib/. Both persist
// to localStorage and apply pre-paint via index.html bootstrap.
//
// Spec: docs/02-design/design-system-v2-aurora.md §5 + §12
// ─────────────────────────────────────────────────────────────────────────

const THEME_OPTIONS: Array<{ id: Theme; label: string; description: string }> = [
  { id: "system", label: "System", description: "Match your device's light/dark setting." },
  { id: "light", label: "Light", description: "Bright canvas, dark text." },
  { id: "dark", label: "Dark", description: "Quiet canvas — easier for long sessions." },
];

const DENSITY_OPTIONS: Array<{ id: Density; label: string; description: string }> = [
  {
    id: "junior",
    label: "Junior",
    description: "Comfortable spacing + larger touch targets. Best for Class 5–10.",
  },
  {
    id: "aspirant",
    label: "Aspirant",
    description: "Standard density. NEET / JEE / UPSC / Class 11–12 (default).",
  },
  {
    id: "pro",
    label: "Pro",
    description: "Compact spacing + smaller chrome. Working pros and tutors.",
  },
];

function ThemeDensitySection() {
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useDensity();
  return (
    <section
      className="vidya-card-block"
      aria-label="Theme and density"
    >
      <div className="vidya-card-block__head">
        <h2 className="vidya-card-block__title">Theme &amp; density</h2>
      </div>
      <p style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: "var(--sp-3)" }}>
        Aurora adapts the visual system to your environment and persona. Both
        switches apply instantly across every screen.
      </p>

      {/* Theme picker */}
      <div
        role="radiogroup"
        aria-label="Theme"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
          marginBottom: "var(--sp-4)",
        }}
      >
        {THEME_OPTIONS.map((opt) => {
          const active = theme === opt.id;
          return (
            <Card
              key={opt.id}
              asButton
              padding="md"
              interactive
              tone={active ? "aurora-ai" : "neutral"}
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(opt.id)}
              style={{
                borderColor: active ? "var(--accent-soft0)" : undefined,
                outline: active ? "2px solid var(--accent-soft0)" : "none",
                outlineOffset: 0,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>
                {opt.description}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Density picker */}
      <div style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 8 }}>
        Density
      </div>
      <div
        role="radiogroup"
        aria-label="Density"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
        }}
      >
        {DENSITY_OPTIONS.map((opt) => {
          const active = density === opt.id;
          return (
            <Card
              key={opt.id}
              asButton
              padding="md"
              interactive
              role="radio"
              aria-checked={active}
              onClick={() => setDensity(opt.id)}
              style={{
                borderColor: active ? "var(--accent-soft0)" : undefined,
                outline: active ? "2px solid var(--accent-soft0)" : "none",
                outlineOffset: 0,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                {opt.label}
                {active ? (
                  <span style={{ color: "var(--accent)", marginLeft: 8 }}>✓</span>
                ) : null}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>
                {opt.description}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
