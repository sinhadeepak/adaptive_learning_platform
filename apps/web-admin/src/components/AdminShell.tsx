// AdminShell — Vidya v1 admin portal chrome.
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 admin mockup set (1/29 onward).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Mirrors the student-side VidyaShell pattern (232px sidebar +
// sticky topbar + Instrument-Serif title + ⌘K-ready search slot
// + actions). Separate component because the admin nav surface
// (~19 entries grouped Operate / Catalog / Quality / Account)
// differs from the student's Learn / Insight / Support set, and
// the user-card footer reads `PLATFORM_ADMIN` instead of the
// student's persona / exam meta.

import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-provider";
import { ResearchJobsToaster } from "./ResearchJobsToaster";

export interface AdminShellProps {
  crumbs?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number | string;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    heading: "Operate",
    items: [
      { href: "/dashboard", label: "Console", icon: <IconBolt /> },
      { href: "/flags", label: "Feature flags", icon: <IconFlag /> },
      { href: "/tenants", label: "Tenants", icon: <IconBuilding /> },
      { href: "/exams", label: "Exams", icon: <IconExam /> },
      { href: "/users", label: "Users", icon: <IconUser /> },
      { href: "/educator-scope", label: "Educator scope", icon: <IconPencil /> },
      { href: "/audit", label: "Audit log", icon: <IconScroll /> },
      { href: "/ops", label: "Ops dashboard", icon: <IconSun /> },
    ],
  },
  {
    heading: "Analyse",
    items: [
      { href: "/analytics/drill", label: "Analytics drill", icon: <IconSearch /> },
      { href: "/platform-analytics", label: "Platform analytics", icon: <IconChart /> },
      { href: "/translation-analytics", label: "Translation analytics", icon: <IconGlobe /> },
      { href: "/ai-providers", label: "AI providers", icon: <IconCircuit /> },
      { href: "/ai-cost", label: "AI cost", icon: <IconRupee /> },
      { href: "/calibration-dashboard", label: "Calibration", icon: <IconTarget /> },
    ],
  },
  {
    heading: "Quality",
    items: [
      { href: "/translation-review", label: "Translations", icon: <IconGlobe /> },
      { href: "/translation-batches", label: "Batches", icon: <IconGlobe /> },
      { href: "/translation-verify", label: "Verify queue", icon: <IconCheck /> },
      { href: "/languages", label: "Languages", icon: <IconGlobe /> },
      { href: "/cultural-review", label: "Cultural review", icon: <IconHeart /> },
      { href: "/grader-queue", label: "Grader queue", icon: <IconPen /> },
      { href: "/tutors-admin", label: "Tutor moderation", icon: <IconCheck /> },
      { href: "/ratings-mod", label: "Rating moderation", icon: <IconStar /> },
    ],
  },
  {
    heading: "Account",
    items: [
      { href: "/profile", label: "Profile", icon: <IconCard /> },
      { href: "/settings", label: "Settings", icon: <IconGear /> },
    ],
  },
];

export function AdminShell({
  crumbs,
  title,
  subtitle,
  chips,
  actions,
  children,
}: AdminShellProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const initials =
    ((user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "")).toUpperCase() ||
    "A";
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Admin";
  const roleMeta = (user?.role ?? "PLATFORM_ADMIN").replace(/_/g, "_");

  return (
    <div className="vidya-shell">
      <ResearchJobsToaster />
      <aside className="vidya-shell__sidebar" aria-label="Admin navigation">
        <Link to="/dashboard" className="vidya-shell__brand" aria-label="Vidya admin home">
          <span className="vidya-shell__brand-mark">V</span>
          <span>
            <span className="vidya-shell__brand-name">
              v<em>⌑</em>dya
            </span>
            <span className="vidya-shell__brand-meta">Admin</span>
          </span>
        </Link>

        <nav className="vidya-shell__nav">
          {NAV.map((group) => (
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
                    className="vidya-shell__nav-item"
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="vidya-shell__nav-icon" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="vidya-shell__nav-label">{item.label}</span>
                    {item.badge !== undefined ? (
                      <span className="vidya-shell__nav-badge">{item.badge}</span>
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
            <div className="vidya-shell__user-meta">{roleMeta}</div>
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
            {subtitle ? (
              <p className="vidya-shell__subtitle">{subtitle}</p>
            ) : null}
          </div>

          <label className="vidya-shell__search">
            <span aria-hidden>⌕</span>
            <input
              type="search"
              placeholder="Search flags, tenants, users, exams…"
            />
            <span className="vidya-shell__search-kbd">⌘K</span>
          </label>

          {chips ? <div className="vidya-shell__chips">{chips}</div> : <div />}

          <div className="vidya-shell__topbar-actions">{actions}</div>
        </header>
        <main className="vidya-shell__content">{children}</main>
      </div>
    </div>
  );
}

/* ── Inline icons (16×16, currentColor stroke) ──────────────── */

function IconBolt() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" /></svg>
  );
}
function IconFlag() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 14V3l8 2-3 3 3 3-8 1z" strokeLinejoin="round" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="10" height="10" /><path d="M5.5 5.5h1M9.5 5.5h1M5.5 8h1M9.5 8h1M5.5 10.5h1M9.5 10.5h1" />
    </svg>
  );
}
function IconExam() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="10" height="10" rx="2" /><path d="M5.5 7h5M5.5 9.5h3" strokeLinecap="round" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="6" r="2.4" /><path d="M3.5 13c.7-2.4 2.6-3.5 4.5-3.5s3.8 1.1 4.5 3.5" />
    </svg>
  );
}
function IconPencil() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 13l1-3 7-7 2 2-7 7-3 1z" strokeLinejoin="round" />
    </svg>
  );
}
function IconScroll() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 3h7v9H4zM11 6h2v6a1 1 0 01-2 0M4 4.5h5M4 6.5h5M4 8.5h5M4 10.5h3" />
    </svg>
  );
}
function IconSun() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="2.5" /><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.6 3.6l1 1M11.4 11.4l1 1M11.4 4.6l1-1M3.6 12.4l1-1" strokeLinecap="round" />
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
function IconChart() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 13V3M3 13h10M5.5 11V8M8 11V5M10.5 11V9" strokeLinecap="round" />
    </svg>
  );
}
function IconCircuit() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="4" cy="8" r="1.5" /><circle cx="12" cy="4" r="1.5" /><circle cx="12" cy="12" r="1.5" />
      <path d="M5.5 8L10.5 4M5.5 8L10.5 12" />
    </svg>
  );
}
function IconRupee() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5 4h7M5 6.5h7M5 6.5c2 0 4 1 4 3s-2 3-4 3l5 0M5 13l4-4" strokeLinecap="round" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5" /><circle cx="8" cy="8" r="2.4" />
    </svg>
  );
}
function IconGlobe() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5" /><path d="M3 8h10M8 3c2 2 2 8 0 10M8 3c-2 2-2 8 0 10" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 8l3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 13s-5-3-5-7a2.5 2.5 0 015-1 2.5 2.5 0 015 1c0 4-5 7-5 7z" strokeLinejoin="round" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 14l3-1 8-8-2-2-8 8-1 3zM10 4l2 2" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4L2.2 6.3l4-.6L8 2z" strokeLinejoin="round" />
    </svg>
  );
}
function IconCard() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="4" width="10" height="8" rx="1" /><path d="M3 7h10M5.5 9.5h3" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="2" /><path d="M8 2.5v1.8M8 11.7v1.8M2.5 8h1.8M11.7 8h1.8M4.2 4.2l1.3 1.3M10.5 10.5l1.3 1.3M11.8 4.2l-1.3 1.3M5.5 10.5l-1.3 1.3" strokeLinecap="round" />
    </svg>
  );
}
