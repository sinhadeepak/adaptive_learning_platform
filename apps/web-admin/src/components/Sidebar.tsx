import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

interface NavEntry {
  id: string;
  to: string | null;
  icon: string;
  label: string;
}

// Mirrors docs/ui/03_AdminPortal/00_components.js admin nav.
// Only the Flags + audit routes are wired today; the rest are
// disabled stubs (Phase 2 sprints land them).
const NAV: NavEntry[] = [
  { id: "console", to: "/dashboard", icon: "⚡", label: "Console" },
  { id: "flags", to: "/flags", icon: "⚑", label: "Feature flags" },
  { id: "tenants", to: "/tenants", icon: "🏛", label: "Tenants" },
  { id: "exams", to: "/exams", icon: "📚", label: "Exams" },
  { id: "users", to: "/users", icon: "👤", label: "Users" },
  { id: "educator-scope", to: "/educator-scope", icon: "🎓", label: "Educator scope" },
  { id: "audit", to: "/audit", icon: "📜", label: "Audit log" },
  { id: "ops", to: "/ops", icon: "⚙", label: "Ops dashboard" },
  // Phase 7 (P7-A1) — hierarchical analytics drill + the existing
  // platform-wide and per-institute deep dives. Surfaced here so the
  // richer dashboards aren't buried behind a deep-link.
  { id: "drill", to: "/analytics/drill", icon: "🔍", label: "Analytics drill" },
  { id: "platform-analytics", to: "/platform-analytics", icon: "📊", label: "Platform analytics" },
  // Phase 5 (P5-S54) — admin operator surfaces.
  { id: "ai-providers", to: "/ai-providers", icon: "🤖", label: "AI providers" },
  { id: "ai-cost", to: "/ai-cost", icon: "💸", label: "AI cost" },
  { id: "calibration", to: "/calibration-dashboard", icon: "🎯", label: "Calibration" },
  { id: "translation-analytics", to: "/translation-analytics", icon: "🌐", label: "Translations" },
  { id: "translation-review", to: "/translation-review", icon: "✓", label: "T-review" },
  { id: "cultural-review", to: "/cultural-review", icon: "🪷", label: "Cultural review" },
  { id: "grader-queue", to: "/grader-queue", icon: "📝", label: "Grader queue" },
  { id: "profile", to: "/profile", icon: "🪪", label: "Profile" },
  { id: "settings", to: "/settings", icon: "⚙️", label: "Settings" },
];

export function Sidebar({
  user,
  onSignOut,
}: {
  user: { firstName?: string; role?: string } | null;
  onSignOut: () => void;
}): ReactNode {
  const { pathname } = useLocation();
  const initial = (user?.firstName ?? "?").slice(0, 1).toUpperCase();

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-logo">
        <div className="sidebar-mark">A</div>
        <span className="sidebar-mark-text">Admin</span>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((n) => {
          const active = n.to ? pathname === n.to || pathname.startsWith(`${n.to}/`) : false;
          return n.to ? (
            <Link key={n.id} to={n.to} className={`nav-item ${active ? "active" : ""}`}>
              <span className="nav-icon" aria-hidden>
                {n.icon}
              </span>
              <span>{n.label}</span>
            </Link>
          ) : (
            <span
              key={n.id}
              className="nav-item disabled"
              title="Coming soon"
              aria-disabled
            >
              <span className="nav-icon" aria-hidden>
                {n.icon}
              </span>
              <span>{n.label}</span>
            </span>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        <Link
          to="/profile"
          className="avatar"
          aria-label="Open profile"
          style={{ textDecoration: "none" }}
        >
          {initial}
        </Link>
        <Link
          to="/profile"
          className="avatar-name"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          {user?.firstName ?? "Guest"}
          {user?.role ? <span className="avatar-role"> · {user.role}</span> : null}
        </Link>
        <button
          type="button"
          className="signout-btn"
          onClick={onSignOut}
          aria-label="Sign out"
        >
          ⏻
        </button>
      </div>
    </aside>
  );
}
