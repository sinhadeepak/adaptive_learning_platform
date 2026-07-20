// AppShell — Vidya v1 teacher/educator portal chrome.
//
// Mirrors the web-admin AdminShell (vidya-shell chrome: 232px
// sidebar + sticky topbar + Instrument-Serif title + search slot +
// chips/actions) so the educator portal shares one elevated system.
// Nav is grouped Teach / Author / Analyse / Earn; the brand reads
// "vᴇdya · Educator". Role gating (canAuthor / canReview) and the
// read-only notice for non-authors are preserved from the prior shell.

import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, canAuthor, canReview } from "../lib/auth-provider";
import { DraftJobsToaster } from "./DraftJobsToaster";
import { ThemeToggle } from "./ThemeToggle";
import type { TopbarChip } from "./Topbar";

export type { TopbarChip };

export function AppShell({
  crumbs,
  title,
  subtitle,
  chips = [],
  actions,
  children,
}: {
  crumbs?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  chips?: TopbarChip[];
  actions?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const initial = (user?.firstName ?? "?").slice(0, 1).toUpperCase();
  const fullName = user?.firstName ?? "Guest";

  function canSee(id: string): boolean {
    if (id === "review") return canReview(user?.role);
    if (id === "resources") return canAuthor(user?.role);
    return true;
  }

  function isActive(item: NavItem): boolean {
    const { pathname } = location;
    if (item.match) return item.match(pathname);
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <div className="vidya-shell">
      <DraftJobsToaster />
      <aside className="vidya-shell__sidebar" aria-label="Educator navigation">
        <Link to="/dashboard" className="vidya-shell__brand" aria-label="Vidya educator home">
          <span className="vidya-shell__brand-mark">V</span>
          <span>
            <span className="vidya-shell__brand-name">
              v<em>⌑</em>dya
            </span>
            <span className="vidya-shell__brand-meta">Educator</span>
          </span>
        </Link>

        <nav className="vidya-shell__nav">
          {NAV.map((group) => {
            const items = group.items.filter((it) => canSee(it.id));
            if (items.length === 0) return null;
            return (
              <div key={group.heading} className="vidya-shell__nav-group">
                <div className="vidya-shell__nav-heading">{group.heading}</div>
                {items.map((item) => (
                  <Link
                    key={item.id}
                    to={item.href}
                    className="vidya-shell__nav-item"
                    aria-current={isActive(item) ? "page" : undefined}
                  >
                    <span className="vidya-shell__nav-icon" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="vidya-shell__nav-label">{item.label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="vidya-shell__user">
          <div className="vidya-shell__user-avatar">{initial}</div>
          <div>
            <div className="vidya-shell__user-name">{fullName}</div>
            <div className="vidya-shell__user-meta">{user?.role ?? "GUEST"}</div>
          </div>
          <button
            className="vidya-shell__theme-toggle"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => {
              void logout();
              navigate("/login", { replace: true });
            }}
          >
            ⎋
          </button>
        </div>
      </aside>

      <div className="vidya-shell__main">
        <header className="vidya-shell__topbar">
          <div>
            {crumbs ? <p className="vidya-shell__crumbs">{crumbs}</p> : null}
            <h1 className="vidya-shell__title">{title}</h1>
            {subtitle ? <p className="vidya-shell__subtitle">{subtitle}</p> : null}
          </div>

          <label className="vidya-shell__search">
            <span aria-hidden>⌕</span>
            <input type="search" placeholder="Search students, questions, cohorts…" />
            <span className="vidya-shell__search-kbd">⌘K</span>
          </label>

          {chips.length > 0 ? (
            <div className="vidya-shell__chips">
              {chips.map((chip, i) => (
                <span key={i} className="vidya-shell__chip">
                  {chip.live ? <span className="status-dot status-dot--success" /> : null}
                  {chip.label}
                </span>
              ))}
            </div>
          ) : (
            <div />
          )}

          <div className="vidya-shell__topbar-actions">
            <ThemeToggle />
            {actions}
          </div>
        </header>

        <main className="vidya-shell__content">
          {!canAuthor(user?.role) ? (
            <div
              className="card"
              style={{
                marginBottom: "var(--sp-4)",
                padding: "var(--sp-4)",
                fontSize: 13,
                color: "var(--ink-2)",
              }}
            >
              Your role <strong>{user?.role ?? "—"}</strong> is read-only on
              authoring screens. Authoring is open to TEACHER and above.
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

/* ── Nav model ──────────────────────────────────────────────── */

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: ReactNode;
  match?: (pathname: string) => boolean;
}
interface NavGroup {
  heading: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    heading: "Teach",
    items: [
      { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: <IconBolt /> },
      { id: "students", href: "/students", label: "Students", icon: <IconCap /> },
      { id: "doubts", href: "/doubts", label: "Doubts", icon: <IconChat /> },
      { id: "assignments", href: "/assignments", label: "Assignments", icon: <IconClipboard /> },
    ],
  },
  {
    heading: "Author",
    items: [
      {
        id: "questions",
        href: "/questions",
        label: "My questions",
        icon: <IconBook />,
        match: (p) => p === "/questions" || p === "/questions/new",
      },
      { id: "review", href: "/review", label: "Review", icon: <IconSearch /> },
      {
        id: "resources",
        href: "/content/resources",
        label: "Resources",
        icon: <IconFilm />,
        match: (p) => p.startsWith("/content/resources"),
      },
    ],
  },
  {
    heading: "Analyse",
    items: [{ id: "analytics", href: "/analytics", label: "Analytics", icon: <IconChart /> }],
  },
  {
    heading: "Earn",
    items: [
      { id: "tutoring", href: "/tutor", label: "Tutoring", icon: <IconChalk />, match: (p) => p.startsWith("/tutor") },
      {
        id: "creator",
        href: "/creator/courses",
        label: "My courses",
        icon: <IconFilm />,
        match: (p) => p.startsWith("/creator/courses"),
      },
      { id: "earnings", href: "/creator/earnings", label: "Earnings", icon: <IconRupee /> },
    ],
  },
];

/* ── Inline icons (16×16, currentColor) ─────────────────────── */

function IconBolt() {
  return <svg viewBox="0 0 16 16" fill="currentColor"><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" /></svg>;
}
function IconCap() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 3l6 3-6 3-6-3 6-3z" strokeLinejoin="round" /><path d="M4 7.5V11c0 1 2 2 4 2s4-1 4-2V7.5" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 4h10v7H7l-3 2.5V11H3z" strokeLinejoin="round" />
    </svg>
  );
}
function IconClipboard() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="4" y="3" width="8" height="11" rx="1" /><path d="M6 3a2 2 0 014 0M6.5 7h3M6.5 9.5h3" strokeLinecap="round" />
    </svg>
  );
}
function IconBook() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 3.5h4.5a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 00-1.5-1.5H3zM13 3.5H8.5A1.5 1.5 0 007 5v8a1.5 1.5 0 011.5-1.5H13z" strokeLinejoin="round" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7" cy="7" r="4" /><path d="M10.2 10.2L13 13" strokeLinecap="round" />
    </svg>
  );
}
function IconFilm() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="4" width="10" height="8" rx="1" /><path d="M6 4v8M10 4v8M3 7h3M10 7h3M3 9.5h3M10 9.5h3" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 13V3M3 13h10M5.5 11V8M8 11V5M10.5 11V9" strokeLinecap="round" />
    </svg>
  );
}
function IconChalk() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="3" width="11" height="7" rx="1" /><path d="M5.5 13l2.5-3 2.5 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconRupee() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5 4h6M5 6.5h6M5 6.5c2 0 4 1 4 3s-2 3-4 3l5 0M5 13l4-4" strokeLinecap="round" />
    </svg>
  );
}
