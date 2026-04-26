import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

interface NavEntry {
  id: string;
  to: string | null; // null = stub (route not implemented yet)
  icon: string;
  label: string;
}

// Mirrors docs/ui/01_StudentPortal_Web/00_components.js ALP_NAV. Routes that
// don't exist yet are shown disabled rather than fabricated — the design says
// these tabs exist; the engineering reality is that only home/catalog/search
// are wired. Filling them in is the work of subsequent screen PRs.
const NAV: NavEntry[] = [
  { id: "home", to: "/home", icon: "⚡", label: "Home" },
  { id: "study", to: "/catalog", icon: "📚", label: "Study" },
  { id: "practice", to: null, icon: "🎯", label: "Practice" },
  { id: "analysis", to: null, icon: "📊", label: "Analysis" },
  { id: "experts", to: null, icon: "💬", label: "Experts" },
  { id: "leaderboard", to: null, icon: "🏆", label: "Rank" },
  { id: "search", to: "/search", icon: "🔍", label: "Search" },
  { id: "profile", to: "/profile", icon: "👤", label: "Profile" },
  { id: "settings", to: "/settings", icon: "⚙️", label: "Settings" },
];

export function Sidebar({
  user,
  onSignOut,
}: {
  user: { firstName?: string } | null;
  onSignOut: () => void;
}): ReactNode {
  const { pathname } = useLocation();
  const initial = (user?.firstName ?? "?").slice(0, 1).toUpperCase();

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-logo">
        <div className="sidebar-mark">A</div>
        <span className="sidebar-mark-text">AdaptiveLearn</span>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((n) =>
          n.to ? (
            <Link
              key={n.id}
              to={n.to}
              className={`nav-item ${isActive(pathname, n.to) ? "active" : ""}`}
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
          ),
        )}
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

function isActive(pathname: string, to: string): boolean {
  if (to === "/home") return pathname === "/home" || pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
