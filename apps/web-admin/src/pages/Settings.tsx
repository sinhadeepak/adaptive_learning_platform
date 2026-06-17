import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AdminShell } from "../components/AdminShell";
import { Banner, SkeletonRows } from "../components/primitives";

// ─────────────────────────────────────────────────────────────────────────
// Admin Settings — narrower than student settings since most admin
// preferences belong on the platform-config screen (Phase 2). What lives
// here today: account-level prefs (language, locale display) + sign-out.
// Everything else points at the right surface.
// ─────────────────────────────────────────────────────────────────────────

interface ProfileResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    phone?: string | null;
    role?: string;
    adminAccessLevel?: string;
  };
  preferences: { language: string; dailyGoalMinutes: number | null };
}

type Language = "en" | "hi" | "hinglish";

const LANG_OPTIONS: Array<{ id: Language; label: string; sub: string; lang?: string }> = [
  { id: "en", label: "English", sub: "Default UI language." },
  { id: "hi", label: "हिन्दी", sub: "Hindi UI rolls out from Sprint 2.", lang: "hi" },
  { id: "hinglish", label: "Hinglish", sub: "Mixed-script labels." },
];

export function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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
        body: JSON.stringify({ language }),
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

  const subtitle = (
    <>
      Personal preferences for your admin account. Platform-wide settings
      (plans, pricing, channel toggles, syllabus overrides) live on the{" "}
      <strong>Configuration</strong> page (Phase 2). Feature flags are on the{" "}
      <Link to="/flags" className="auth-link">Flags</Link> screen.
    </>
  );

  if (error && !profile) {
    return (
      <AdminShell crumbs="Account · Settings" title="Settings">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      </AdminShell>
    );
  }

  if (!profile) {
    return (
      <AdminShell crumbs="Account · Settings" title="Settings">
        <SkeletonRows count={3} />
      </AdminShell>
    );
  }

  const dirty = language !== (profile.preferences.language ?? "en");
  const isPlatform = profile.user.adminAccessLevel === "PLATFORM";

  return (
    <AdminShell
      crumbs="Account · Settings"
      title="Settings"
      subtitle={subtitle}
      actions={
        <Link to="/profile" className="btn btn-ghost">
          ← Back to profile
        </Link>
      }
    >
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
        <section className="topic-section">
          <h2 className="topic-section-title">UI language</h2>
          <p className="topic-section-body" style={{ marginBottom: "var(--sp-3)" }}>
            Affects labels, copy, and date formats on this admin surface.
          </p>
          <div role="radiogroup" aria-label="UI language" className="option-list">
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
            onClick={() => setLanguage((profile.preferences.language as Language) ?? "en")}
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
            <div>
              <dt>Role</dt>
              <dd>{profile.user.role ?? "—"}</dd>
            </div>
            <div>
              <dt>Admin level</dt>
              <dd>{profile.user.adminAccessLevel ?? "NONE"}</dd>
            </div>
          </dl>
        </section>

        <section className="topic-section">
          <h2 className="topic-section-title">Where else to look</h2>
          <ul className="row-list">
            <li>
              <Link to="/flags" className="row-link">
                <div className="row-link-body">
                  <p className="row-link-title">⚑ Feature flags</p>
                  <p className="row-link-meta">
                    Platform defaults · per-tenant overrides · NATS broadcast
                  </p>
                </div>
                <span className="chevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
            <li>
              <Link to="/audit" className="row-link">
                <div className="row-link-body">
                  <p className="row-link-title">📜 Audit log</p>
                  <p className="row-link-meta">
                    Every admin write since the start
                  </p>
                </div>
                <span className="chevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
            <li>
              <Link to="/ops" className="row-link">
                <div className="row-link-body">
                  <p className="row-link-title">⚙ Ops dashboard</p>
                  <p className="row-link-meta">SLO health · drills (Phase 2)</p>
                </div>
                <span className="chevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          </ul>
        </section>

        <section
          className="topic-section"
          style={{ borderColor: "var(--bad-soft)" }}
        >
          <h2
            className="topic-section-title"
            style={{ color: "var(--bad)" }}
          >
            Sign out
          </h2>
          <p className="topic-section-body" style={{ marginBottom: "var(--sp-3)" }}>
            Signs you out on this browser.
            {isPlatform ? (
              <>
                {" "}As a platform admin, your sign-in / sign-out is logged
                immutably.
              </>
            ) : null}
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            style={{
              borderColor: "var(--bad-soft)",
              color: "var(--bad)",
            }}
          >
            {signingOut ? "Signing out…" : "Sign out of this device"}
          </button>
        </section>
      </div>
    </AdminShell>
  );
}