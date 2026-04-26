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
  { id: "users", to: "/users", icon: "👤", label: "Users" },
  { id: "audit", to: "/audit", icon: "📜", label: "Audit log" },
  { id: "ops", to: "/ops", icon: "⚙", label: "Ops dashboard" },
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
        <div className="avatar">{initial}</div>
        <span className="avatar-name">
          {user?.firstName ?? "Guest"}
          {user?.role ? <span className="avatar-role"> · {user.role}</span> : null}
        </span>
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
