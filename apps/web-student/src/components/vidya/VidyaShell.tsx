// VidyaShell — left sidebar + topbar + content wrapper for the
// v1 redesigned pages (Home, ExamDetail, StudyMap, Quiz, QuizResult).
//
// Spec: docs/02-design/design-system/04_components.md §9 + §10
//       + the 8-screen mockup set delivered with Vidya v1.
//
// Separate from the legacy <AppShell> on purpose so pages can be
// migrated page-by-page without breaking the routes that still
// expect the Aurora sidebar + topbar.

import { useEffect, useRef, useState, type ReactNode } from "react";
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

  // Sidebar reorganized 2026-05-22:
  //   * AI Tutor + PYQ Hub promoted in LEARN (PYQ is the #1 organic
  //     search query among Indian aspirants; the route already existed
  //     at /pyq but wasn't surfaced).
  //   * Battle dropped from PRACTICE — gamification noise for a serious
  //     exam-prep persona. Route stays live for opt-in entry from
  //     AI Practice.
  //   * Quick revision (/revision) and Flashcards (/flashcards) promoted
  //     to PRACTICE — both routes existed but were unreachable from nav.
  //   * INSIGHT renamed to PROGRESS; Rank moved here from COMPETE so the
  //     AIR predictor sits next to the analytics it depends on.
  //   * COMPETE renamed to COMMUNITY and collapsed: Clans + Leaderboards
  //     only. Friends folded into Clans (social-graph standalone doesn't
  //     pull weight for exam-prep aspirants).
  return [
    {
      heading: "Learn",
      items: [
        { href: "/home", label: "Dashboard", icon: <IconHome />, kbd: "⌘1" },
        ...examItems,
        { href: "/experts", label: "AI Tutor", icon: <IconChat /> },
        { href: "/pyq", label: "PYQ Hub", icon: <IconArchive /> },
        { href: "/library", label: "Library", icon: <IconLibrary /> },
        // "Study materials" intentionally NOT in the left nav — it is
        // exam-scoped and reached from the exam dashboard's QuickActions
        // ("Study materials" card → /exams/:examId/content).
        { href: "/doubts", label: "Doubts", icon: <IconQuestion /> },
        {
          href: "/exams/add",
          label: "Add exam / course",
          icon: <IconPlus />,
          add: true,
        },
      ],
    },
    {
      heading: "Practice",
      items: [
        { href: "/practice", label: "AI practice", icon: <IconBolt /> },
        { href: "/mocks", label: "Mock tests", icon: <IconTarget />, badge: 3 },
        { href: "/revision", label: "Quick revision", icon: <IconRefresh /> },
        { href: "/flashcards", label: "Flashcards", icon: <IconCards /> },
        { href: "/plan", label: "Plan", icon: <IconCalendar /> },
      ],
    },
    {
      heading: "Progress",
      items: [
        { href: "/history", label: "History", icon: <IconClock /> },
        { href: "/analysis", label: "My analysis", icon: <IconChart /> },
        { href: "/insights", label: "Insights", icon: <IconSparkles /> },
        { href: "/syllabus", label: "Syllabus", icon: <IconLibrary /> },
        { href: "/rank", label: "Rank predictor", icon: <IconTrophy /> },
      ],
    },
    {
      heading: "Community",
      items: [
        { href: "/clans", label: "Clans", icon: <IconCastle /> },
        { href: "/leaderboards", label: "Leaderboards", icon: <IconMedal /> },
      ],
    },
    {
      heading: "Marketplace",
      items: [
        { href: "/marketplace", label: "Marketplace", icon: <IconCap /> },
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

  // User-avatar dropdown state.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userBlockRef = useRef<HTMLDivElement>(null);

  // Close on click-outside.
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        userBlockRef.current &&
        !userBlockRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [userMenuOpen]);

  // Close on ESC.
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [userMenuOpen]);

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
        const examsBody = (await examsRes.json()) as
          | ExamMeta[]
          | { exams?: ExamMeta[] | null };
        // /catalog/exams returns either a bare array OR {exams: [...]}.
        // Tolerate both shapes — a single typed wrapper would be cleaner
        // but we don't own that endpoint yet.
        const catalog: ExamMeta[] = Array.isArray(examsBody)
          ? examsBody
          : Array.isArray(examsBody.exams)
            ? examsBody.exams
            : [];
        const enrolledIds = new Set(
          (Array.isArray(profile.exams) ? profile.exams : []).map(
            (e) => e.examId,
          ),
        );
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

        {/* User block + dropdown */}
        <div ref={userBlockRef} style={{ position: "relative" }}>
          {/* Dropdown menu — opens ABOVE the user row */}
          {userMenuOpen && (
            <div
              role="menu"
              aria-label="User menu"
              style={{
                position: "absolute",
                bottom: "calc(100% + var(--sp-2, 8px))",
                left: 0,
                right: 0,
                background: "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius, 8px)",
                padding: "var(--sp-1, 4px) 0",
                zIndex: 200,
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              }}
            >
              {(
                [
                  { href: "/search",    label: "Search",   icon: <IconSearch /> },
                  { href: "/bookmarks", label: "Saved",    icon: <IconStar /> },
                  { href: "/profile",   label: "Profile",  icon: <IconUser /> },
                  { href: "/settings",  label: "Settings", icon: <IconCog /> },
                ] as const
              ).map(({ href, label, icon }) => (
                <Link
                  key={href}
                  to={href}
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--sp-2, 8px)",
                    padding: "var(--sp-2, 8px) var(--sp-3, 12px)",
                    color: "var(--ink)",
                    textDecoration: "none",
                    fontSize: 13,
                  }}
                >
                  <span style={{ width: 16, height: 16, flexShrink: 0 }} aria-hidden>
                    {icon}
                  </span>
                  {label}
                </Link>
              ))}
              <div
                style={{
                  borderTop: "1px solid var(--rule)",
                  margin: "var(--sp-1, 4px) 0",
                }}
              />
              <button
                type="button"
                role="menuitem"
                onClick={() => { toggleTheme(); setUserMenuOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--sp-2, 8px)",
                  width: "100%",
                  padding: "var(--sp-2, 8px) var(--sp-3, 12px)",
                  background: "none",
                  border: "none",
                  color: "var(--ink)",
                  cursor: "pointer",
                  fontSize: 13,
                  textAlign: "left",
                }}
              >
                <span style={{ width: 16, flexShrink: 0 }} aria-hidden>☀</span>
                Toggle theme
              </button>
            </div>
          )}

          {/* Clickable user row */}
          <div
            className="vidya-shell__user"
            role="button"
            tabIndex={0}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setUserMenuOpen((v) => !v);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <div className="vidya-shell__user-avatar">{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="vidya-shell__user-name">{fullName}</div>
              <div className="vidya-shell__user-meta">
                {user?.role === "STUDENT" ? "Pro · NEET 2027" : (user?.role ?? "")}
              </div>
            </div>
            <span aria-hidden style={{ fontSize: 10, flexShrink: 0, opacity: 0.6 }}>
              {userMenuOpen ? "▴" : "▾"}
            </span>
          </div>
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
function IconPlus() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
  );
}
function IconLibrary() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 13V5l3-2 3 2 3-2 3 2v8" strokeLinejoin="round" />
      <path d="M2 13h12" strokeLinecap="round" />
      <path d="M8 5v8" strokeLinecap="round" />
    </svg>
  );
}
function IconQuestion() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M6.5 6.5a1.5 1.5 0 013 .5c0 1-1.5 1.5-1.5 2.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r=".5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M5 2v3M11 2v3M2.5 7h11" strokeLinecap="round" />
    </svg>
  );
}
function IconCastle() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 13V8H2V5h3V3h1v2h4V3h1v2h3v3h-1v5z" strokeLinejoin="round" />
      <path d="M6 13V9h4v4" strokeLinejoin="round" />
    </svg>
  );
}
function IconMedal() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="9.5" r="4" />
      <path d="M5.5 5.5L4 2h8L10.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSparkles() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2v2M8 12v2M14 8h-2M4 8H2" strokeLinecap="round" />
      <path d="M8 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" strokeLinejoin="round" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="6" r="3" />
      <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" strokeLinecap="round" />
    </svg>
  );
}
function IconCap() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 4L2 7l6 3 6-3z" strokeLinejoin="round" />
      <path d="M4.5 8.5v3c0 1 1.5 2 3.5 2s3.5-1 3.5-2v-3" strokeLinecap="round" />
      <path d="M13 7v4" strokeLinecap="round" />
    </svg>
  );
}

function IconArchive() {
  // PYQ Hub — drawer / archive of past years.
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="3" width="12" height="3" rx="0.5" />
      <path d="M3 6v7h10V6" strokeLinejoin="round" />
      <path d="M6.5 9h3" strokeLinecap="round" />
    </svg>
  );
}
function IconRefresh() {
  // Quick revision — circular arrow for repeating/recall cycles.
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 8a5 5 0 019-3" strokeLinecap="round" />
      <path d="M11 2v3h-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 8a5 5 0 01-9 3" strokeLinecap="round" />
      <path d="M5 14v-3h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCards() {
  // Flashcards — two slightly offset stacked cards.
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3.5" y="4.5" width="8" height="8" rx="1" />
      <path d="M5 3.5h8v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3 3" strokeLinecap="round" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2l1.5 3.5 3.5.5-2.5 2.5.5 3.5L8 10.5 5 12.5l.5-3.5L3 6.5l3.5-.5z" strokeLinejoin="round" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3l2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCog() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M12.5 3.5l-1 1M4.5 11.5l-1 1" strokeLinecap="round" />
    </svg>
  );
}
