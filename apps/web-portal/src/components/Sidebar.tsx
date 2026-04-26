import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

interface NavEntry {
  id: string;
  to: string | null;
  icon: string;
  label: string;
  match?: (pathname: string) => boolean;
}

// Mirrors docs/ui/04_TeacherPortal/00_components.js — only the routes that
// currently exist in this app are linked; the rest are shown disabled with
// the same tooltip pattern the student app uses (consistency across portals).
const NAV: NavEntry[] = [
  { id: "dashboard", to: "/dashboard", icon: "⚡", label: "Dashboard" },
  { id: "students", to: "/students", icon: "🎓", label: "Students" },
  { id: "doubts", to: "/doubts", icon: "💬", label: "Doubts" },
  { id: "assignments", to: "/assignments", icon: "📝", label: "Assignments" },
  {
    id: "questions",
    to: "/questions",
    icon: "📚",
    label: "My questions",
    match: (p) => p === "/questions" || p === "/questions/new",
  },
  { id: "review", to: "/review", icon: "🔎", label: "Review" },
  { id: "analytics", to: "/analytics", icon: "📊", label: "Analytics" },
];

export function Sidebar({
  user,
  canSee,
  onSignOut,
}: {
  user: { firstName?: string; role?: string } | null;
  canSee: (id: string) => boolean;
  onSignOut: () => void;
}): ReactNode {
  const { pathname } = useLocation();
  const initial = (user?.firstName ?? "?").slice(0, 1).toUpperCase();

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-logo">
        <div className="sidebar-mark">A</div>
        <span className="sidebar-mark-text">Educator</span>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((n) => {
          const visible = canSee(n.id);
          if (!visible) return null;
          const active = n.to
            ? n.match
              ? n.match(pathname)
              : pathname === n.to || pathname.startsWith(`${n.to}/`)
            : false;
          return n.to ? (
            <Link
              key={n.id}
              to={n.to}
              className={`nav-item ${active ? "active" : ""}`}
            >
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
