import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAvatar } from "../lib/avatar";

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
  { id: "practice", to: "/practice", icon: "🎯", label: "Practice" },
  { id: "library", to: "/library", icon: "📖", label: "Library" },
  { id: "battle", to: "/battle", icon: "⚔", label: "Battle" },
  { id: "friends", to: "/friends", icon: "👥", label: "Friends" },
  { id: "clans", to: "/clans", icon: "🏰", label: "Clans" },
  { id: "leaderboards", to: "/leaderboards", icon: "🏅", label: "Leaderboards" },
  { id: "analysis", to: "/analysis", icon: "📊", label: "Analysis" },
  { id: "experts", to: "/experts", icon: "💬", label: "AI Tutor" },
  { id: "doubts", to: "/doubts", icon: "❓", label: "Doubts" },
  { id: "leaderboard", to: "/rank", icon: "🏆", label: "Rank" },
  { id: "tutors", to: "/tutors", icon: "🧑‍🏫", label: "Find a tutor" },
  { id: "courses", to: "/courses", icon: "🎓", label: "Courses" },
  { id: "bookings", to: "/bookings", icon: "📅", label: "My bookings" },
  { id: "my-courses", to: "/courses-mine", icon: "🛒", label: "My purchases" },
  { id: "search", to: "/search", icon: "🔍", label: "Search" },
  { id: "saved", to: "/bookmarks", icon: "★", label: "Saved" },
  { id: "history", to: "/history", icon: "📜", label: "History" },
  { id: "profile", to: "/profile", icon: "👤", label: "Profile" },
  { id: "settings", to: "/settings", icon: "⚙️", label: "Settings" },
];

export function Sidebar({
  user,
  onSignOut,
}: {
  user: { id?: string; firstName?: string } | null;
  onSignOut: () => void;
}): ReactNode {
  const { pathname } = useLocation();
  const initial = (user?.firstName ?? "?").slice(0, 1).toUpperCase();
  const avatarUrl = useAvatar(user?.id ?? null);

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
          style={{
            textDecoration: "none",
            ...(avatarUrl
              ? {
                  background: `center/cover url(${avatarUrl})`,
                  color: "transparent",
                }
              : {}),
          }}
        >
          {avatarUrl ? "" : initial}
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
