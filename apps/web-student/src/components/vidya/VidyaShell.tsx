// VidyaShell — left sidebar + topbar + content wrapper for the
// v1 redesigned pages (Home, ExamDetail, StudyMap, Quiz, QuizResult).
//
// Spec: docs/02-design/design-system/04_components.md §9 + §10
//       + the 8-screen mockup set delivered with Vidya v1.
//
// Separate from the legacy <AppShell> on purpose so pages can be
// migrated page-by-page without breaking the routes that still
// expect the Aurora sidebar + topbar.

import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth } from "../../lib/api";
import { useAuth } from "../../lib/auth-provider";

export interface VidyaShellProps {
  /** Breadcrumb above the title — short, ALL CAPS, mono. */
  crumbs?: string;
  /** Page title — rendered in Instrument Serif. */
  title: ReactNode;
  /** Optional subtitle below the title. */
  subtitle?: ReactNode;
  /** Chip group right of the search field (filters / segment toggles). */
  chips?: ReactNode;
  /** Right-side primary CTA + icon buttons. */
  actions?: ReactNode;
  /** Main page body. */
  children?: ReactNode;
  /** Whether the topbar is rendered. False for full-bleed quiz pages. */
  hideTopbar?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  /** Inline SVG glyph (16×16, currentColor stroke). */
  icon: ReactNode;
  /** ⌘1, ⌘2 etc. */
  kbd?: string;
  /** Numeric badge (e.g. unread mocks). */
  badge?: number;
  /** When true, render with the +Add affordance style (dashed border, accent text). */
  add?: boolean;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

interface ExamMeta {
  id: string;
  code: string;
  name: string;
}

interface ProfileResponse {
  exams?: Array<{ examId: string; targetDate: string | null }> | null;
}

/**
 * Build the sidebar nav. The Learn group expands to one item per
 * exam the user is enrolled in, plus a "+ Add exam/course" entry
 * that routes to /exams/add. Other groups are static.
 */
function buildNav(enrolledExams: ExamMeta[]): NavGroup[] {
  const examItems: NavItem[] = enrolledExams.map((ex, i) => ({
    href: `/exams/${ex.id}`,
    label: `Exam · ${ex.code || ex.name}`,
    icon: <IconExam />,
    kbd: i === 0 ? "⌘2" : i === 1 ? "⌘3" : i === 2 ? "⌘4" : undefined,
  }));

  return [
    {
      heading: "Learn",
      items: [
        { href: "/home", label: "Dashboard", icon: <IconHome />, kbd: "⌘1" },
        ...examItems,
        {
          href: "/exams/add",
          label: "Add exam / course",
          icon: <IconPlus />,
          add: true,
        },
        ...(enrolledExams.length > 1
          ? [
              {
                href: "/tracks",
                label: "All tracks",
                icon: <IconMap />,
              } as NavItem,
            ]
          : []),
        { href: "/practice", label: "AI practice", icon: <IconBolt /> },
        { href: "/mocks", label: "Mock tests", icon: <IconTarget />, badge: 3 },
      ],
    },
    {
      heading: "Insight",
      items: [
        { href: "/analysis", label: "My analysis", icon: <IconChart /> },
        { href: "/rank", label: "Leaderboard", icon: <IconTrophy /> },
      ],
    },
    {
      heading: "Support",
      items: [
        { href: "/experts", label: "Expert help", icon: <IconChat />, badge: 2 },
        { href: "/updates", label: "Updates", icon: <IconBell /> },
      ],
    },
  ];
}

export function VidyaShell({
  crumbs,
  title,
  subtitle,
  chips,
  actions,
  children,
  hideTopbar,
}: VidyaShellProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const initials = (
    (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "")
  ).toUpperCase() || "·";
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Learner";

  // Sidebar nav is data-driven. We pull the user's enrolled exams from
  // /profile/me, then fetch /catalog/exams once to map examId → exam
  // code (e.g. "NEET 2027"). Failures fall back to a sidebar with no
  // exam items + the "Add exam / course" affordance, so a fresh user
  // (or an offline boot) still has a way in.
  const [enrolledExams, setEnrolledExams] = useState<ExamMeta[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [profileRes, examsRes] = await Promise.all([
          auth.fetch("/api/v1/profile/me"),
          auth.fetch("/api/v1/catalog/exams"),
        ]);
        if (!alive || !profileRes.ok || !examsRes.ok) return;
        const profile = (await profileRes.json()) as ProfileResponse;
        const examsBody = (await examsRes.json()) as {
          exams?: ExamMeta[] | null;
        };
        const enrolledIds = new Set(
          (Array.isArray(profile.exams) ? profile.exams : []).map(
            (e) => e.examId,
          ),
        );
        const catalog = Array.isArray(examsBody.exams) ? examsBody.exams : [];
        if (alive) {
          setEnrolledExams(catalog.filter((e) => enrolledIds.has(e.id)));
        }
      } catch {
        /* offline — sidebar still renders the Add affordance */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const nav = buildNav(enrolledExams);

  return (
    <div className="vidya-shell">
      <aside className="vidya-shell__sidebar" aria-label="Primary navigation">
        <Link to="/home" className="vidya-shell__brand" aria-label="Vidya home">
          <span className="vidya-shell__brand-mark">V</span>
          <span>
            <span className="vidya-shell__brand-name">
              v<em>⌑</em>dya
            </span>
            <span className="vidya-shell__brand-meta">Student</span>
          </span>
        </Link>

        <nav className="vidya-shell__nav">
          {nav.map((group) => (
            <div key={group.heading} className="vidya-shell__nav-group">
              <div className="vidya-shell__nav-heading">{group.heading}</div>
              {group.items.map((item) => {
                const active =
                  location.pathname === item.href ||
                  location.pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={
                      "vidya-shell__nav-item" +
                      (item.add ? " vidya-shell__nav-item--add" : "")
                    }
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="vidya-shell__nav-icon" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="vidya-shell__nav-label">{item.label}</span>
                    {item.badge ? (
                      <span className="vidya-shell__nav-badge">{item.badge}</span>
                    ) : item.kbd ? (
                      <span className="vidya-shell__nav-meta">{item.kbd}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="vidya-shell__user">
          <div className="vidya-shell__user-avatar">{initials}</div>
          <div>
            <div className="vidya-shell__user-name">{fullName}</div>
            <div className="vidya-shell__user-meta">
              {user?.role === "STUDENT" ? "Pro · NEET 2027" : (user?.role ?? "")}
            </div>
          </div>
          <button
            className="vidya-shell__theme-toggle"
            aria-label="Toggle theme"
            onClick={toggleTheme}
            title="Toggle theme"
          >
            ☀
          </button>
        </div>
      </aside>

      <div className="vidya-shell__main">
        {hideTopbar ? null : (
          <header className="vidya-shell__topbar">
            <div>
              {crumbs ? <p className="vidya-shell__crumbs">{crumbs}</p> : null}
              <h1 className="vidya-shell__title">{title}</h1>
              {subtitle ? (
                <p className="vidya-shell__subtitle">{subtitle}</p>
              ) : null}
            </div>

            <label className="vidya-shell__search">
              <span aria-hidden>⌕</span>
              <input
                type="search"
                placeholder="Search topics, questions, students…"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                    e.preventDefault();
                    navigate("/search");
                  }
                }}
              />
              <span className="vidya-shell__search-kbd">⌘K</span>
            </label>

            {chips ? <div className="vidya-shell__chips">{chips}</div> : <div />}

            <div className="vidya-shell__topbar-actions">
              <button
                className="vidya-shell__icon-btn"
                aria-label="Notifications"
                onClick={() => navigate("/inbox")}
              >
                ◔<span className="vidya-shell__icon-btn-dot" aria-hidden />
              </button>
              {actions}
              <button
                className="vidya-shell__icon-btn"
                aria-label="Sign out"
                onClick={() => {
                  void logout();
                  navigate("/login", { replace: true });
                }}
                title="Sign out"
              >
                ⎋
              </button>
            </div>
          </header>
        )}
        <main className="vidya-shell__content">{children}</main>
      </div>
    </div>
  );
}

/* Cycle data-theme on <html>. The persisted choice lives at
   localStorage.alp.theme; the index.html bootstrap script reads it
   on first paint. */
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  document.documentElement.style.colorScheme = next;
  try {
    localStorage.setItem("alp.theme", next);
  } catch {
    /* localStorage blocked — apply lasts the session */
  }
}

/* ─── Inline icon glyphs (16×16, currentColor) ───────────────── */

function IconHome() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 7l5-4 5 4v6H3z" strokeLinejoin="round" />
    </svg>
  );
}
function IconExam() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="10" height="10" rx="2" />
      <path d="M5.5 7h5M5.5 9.5h3" strokeLinecap="round" />
    </svg>
  );
}
function IconMap() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 4.5v8l3-1 4 1 3-1v-8l-3 1-4-1z" />
      <path d="M6 3.5v8M10 4.5v8" />
    </svg>
  );
}
function IconBolt() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5" />
      <circle cx="8" cy="8" r="2.4" />
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
function IconTrophy() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5 3h6v3a3 3 0 01-6 0V3z" />
      <path d="M5 4H3v1a2 2 0 002 2M11 4h2v1a2 2 0 01-2 2M8 9v3M6 13h4" strokeLinecap="round" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 4h10v6H7l-3 3v-3H3z" strokeLinejoin="round" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 11V7a4 4 0 118 0v4l1 1.5H3z" strokeLinejoin="round" />
      <path d="M7 13.5a1.5 1.5 0 003 0" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
  );
}
