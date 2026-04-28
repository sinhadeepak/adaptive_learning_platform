import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/primitives";

// ─────────────────────────────────────────────────────────────────────────
// Admin Profile — your account on the admin surface.
// Reached from sidebar avatar / footer or the Profile nav item.
// Mirrors the AI-first dashboard chrome (red admin accent) but emphasises
// admin-specific context: role, admin_access_level, audit-trail framing.
// ─────────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string | null;
  role?: string;
  adminAccessLevel?: string;
  locale?: string;
  emailVerifiedAt?: string | null;
  createdAt?: string | null;
}

interface ProfileResponse {
  user: AdminUser;
  preferences: { language: string; dailyGoalMinutes: number | null };
}

export function Profile() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
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
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Admin";
  const initial = (user.firstName || "?").slice(0, 1).toUpperCase();
  const isPlatform = user.adminAccessLevel === "PLATFORM";
  const adminPill = isPlatform
    ? { tone: "danger" as const, label: "PLATFORM admin" }
    : user.adminAccessLevel === "INSTITUTION"
      ? { tone: "warning" as const, label: "Institution admin" }
      : { tone: "muted" as const, label: "No admin scope" };

  return (
    <AppShell title="Profile">
      <section className="ai-header" aria-label="Admin profile">
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
            <span className="ai-pill">◈ ADMIN PROFILE</span>
            <Pill tone={adminPill.tone}>{adminPill.label}</Pill>
            {user.role ? <Pill tone="muted">{user.role}</Pill> : null}
          </div>
          <h1 className="ai-header-name">
            <span className="ai-header-name-accent">{fullName}</span>
          </h1>
          <p className="ai-header-sub">
            <strong>{user.email}</strong>
            {user.phone ? ` · ${user.phone}` : ""} ·{" "}
            {user.emailVerifiedAt ? "Email verified" : "Email pending verification"}
            {isPlatform ? (
              <>
                {" "}· <strong>Every action you take on this surface is
                logged immutably to the audit trail.</strong>
              </>
            ) : null}
          </p>
          <div className="ai-header-btns">
            <Link to="/settings" className="btn-ai">
              ◈ Settings
            </Link>
            <Link to="/audit" className="btn btn-ghost">
              Audit log →
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
                "linear-gradient(135deg, var(--color-red), var(--color-amber))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 800,
              color: "#fff",
            }}
            aria-hidden
          >
            {initial}
          </div>
        </div>
      </section>

      <section
        className="topic-stats"
        style={{ marginTop: "var(--sp-4)" }}
        aria-label="Admin stats"
      >
        <div className="topic-stat">
          <div
            className="topic-stat-num"
            style={{
              color: isPlatform
                ? "var(--color-red)"
                : user.adminAccessLevel === "INSTITUTION"
                  ? "var(--color-amber)"
                  : "var(--text-muted)",
            }}
          >
            {user.adminAccessLevel ?? "NONE"}
          </div>
          <div className="topic-stat-lbl">Admin level</div>
          <div className="topic-stat-foot">
            {isPlatform ? "platform-wide writes" : user.adminAccessLevel === "INSTITUTION" ? "tenant-scoped writes" : "read-only"}
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-blue)" }}>
            {user.role ?? "—"}
          </div>
          <div className="topic-stat-lbl">Role</div>
          <div className="topic-stat-foot">access tier</div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-green)" }}>
            {user.emailVerifiedAt ? "✓" : "—"}
          </div>
          <div className="topic-stat-lbl">Email verified</div>
          <div className="topic-stat-foot">
            {user.emailVerifiedAt
              ? new Date(user.emailVerifiedAt).toLocaleDateString()
              : "pending"}
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--color-ai)" }}>
            {user.createdAt
              ? Math.max(
                  0,
                  Math.round(
                    (Date.now() - new Date(user.createdAt).getTime()) /
                      (1000 * 60 * 60 * 24),
                  ),
                )
              : "—"}
            d
          </div>
          <div className="topic-stat-lbl">Account age</div>
          <div className="topic-stat-foot">
            {user.createdAt
              ? `since ${new Date(user.createdAt).toLocaleDateString()}`
              : "—"}
          </div>
        </div>
      </section>

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
              <dt>Created</dt>
              <dd>
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="topic-section">
          <h2 className="topic-section-title">Access &amp; permissions</h2>
          <dl className="kv-list" style={{ padding: 0, gap: "var(--sp-5)" }}>
            <div>
              <dt>Role</dt>
              <dd>{user.role ?? "—"}</dd>
            </div>
            <div>
              <dt>Admin access level</dt>
              <dd>{user.adminAccessLevel ?? "NONE"}</dd>
            </div>
            <div>
              <dt>Can manage flags</dt>
              <dd>{isPlatform || user.adminAccessLevel === "INSTITUTION" ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Can suspend users</dt>
              <dd>{isPlatform ? "Yes (platform)" : user.adminAccessLevel === "INSTITUTION" ? "Within tenant" : "No"}</dd>
            </div>
            <div>
              <dt>Can impersonate</dt>
              <dd>{isPlatform ? "Yes (15-min read-only)" : "No"}</dd>
            </div>
          </dl>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: "var(--sp-3)",
            }}
          >
            Per BRD ADM-REQ-05: a PLATFORM admin cannot be modified by another
            PLATFORM admin. Access grants always log actor + target + old/new
            level.
          </p>
        </section>

        <section className="topic-section">
          <h2 className="topic-section-title">Audit footprint</h2>
          <p className="topic-section-body">
            Every write you perform on this surface lands in the immutable audit
            trail. View your recent activity in the audit log.
          </p>
          <Link
            to="/audit"
            className="btn btn-primary"
            style={{ marginTop: "var(--sp-3)", display: "inline-block" }}
          >
            Open audit log →
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
