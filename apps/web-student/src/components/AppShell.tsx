// AppShell — student portal layout wrapper (Aurora v2).
//
// Backed by @alp/ui's AppShell + NavSidebar + TopBar + MobileTabBar.
// Public API (`title`, `chips`, `actions`, `children`) is unchanged from
// the legacy shell so every page route works without modification — the
// upgrade is purely visual + structural.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.3 + §11
// ADR:  docs/adr/0028-design-system-v2-aurora.md (S3 + S4 deliverable)
//
// Legacy CSS (shell.css) is still loaded so page-level classes like
// `.card`, `.page-greeting`, `.empty-state` keep working during the
// per-page migration — pages will move to @alp/ui primitives in S5+.

import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AppShell as UiAppShell,
  MobileTabBar,
  NavSidebar,
  Tag,
  TopBar,
  type NavSidebarGroup,
  type NavSidebarItem,
  type MobileTabBarItem,
} from "@alp/ui";
import { useAvatar } from "../lib/avatar";
import { useAuth } from "../lib/auth-provider";
import { InboxBell } from "./InboxBell";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette } from "./CommandPalette";
import type { TopbarChip } from "./Topbar";
import "@alp/design-system/shell.css";

// Re-export the chip type so call-sites that import `TopbarChip` from this
// module (via the legacy <AppShell> path) keep type-checking.
export type { TopbarChip };

// Adapter for react-router's Link so NavSidebar/MobileTabBar can use it.
function RouterLink({
  to,
  children,
  className,
  "aria-current": ariaCurrent,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  "aria-current"?: "page" | undefined;
}) {
  return (
    <Link to={to} className={className} aria-current={ariaCurrent}>
      {children}
    </Link>
  );
}

// Sidebar nav, grouped per design-system-v2-aurora.md §7.3.
// Order mirrors the v1 sidebar but adds semantic grouping (Learn /
// Practice / Compete / Analyse / Marketplace / Me).
const NAV_GROUPS: NavSidebarGroup[] = [
  {
    heading: "Learn",
    items: [
      { key: "home", href: "/home", label: "Home", icon: <Glyph>⚡</Glyph> },
      { key: "study", href: "/catalog", label: "Study", icon: <Glyph>📚</Glyph> },
      { key: "library", href: "/library", label: "Library", icon: <Glyph>📖</Glyph> },
      { key: "experts", href: "/experts", label: "AI Tutor", icon: <Glyph>✦</Glyph> },
      { key: "doubts", href: "/doubts", label: "Doubts", icon: <Glyph>❓</Glyph> },
    ],
  },
  {
    heading: "Practice",
    items: [
      { key: "practice", href: "/practice", label: "Practice", icon: <Glyph>🎯</Glyph> },
      { key: "plan", href: "/plan", label: "Plan", icon: <Glyph>🗓</Glyph> },
      { key: "battle", href: "/battle", label: "Battle", icon: <Glyph>⚔</Glyph> },
    ],
  },
  {
    heading: "Compete",
    items: [
      { key: "friends", href: "/friends", label: "Friends", icon: <Glyph>👥</Glyph> },
      { key: "clans", href: "/clans", label: "Clans", icon: <Glyph>🏰</Glyph> },
      { key: "leaderboards", href: "/leaderboards", label: "Leaderboards", icon: <Glyph>🏅</Glyph> },
      { key: "rank", href: "/rank", label: "Rank", icon: <Glyph>🏆</Glyph> },
    ],
  },
  {
    heading: "Analyse",
    items: [
      { key: "insights", href: "/insights", label: "Insights", icon: <Glyph>✦</Glyph> },
      { key: "analysis", href: "/analysis", label: "Analysis", icon: <Glyph>📊</Glyph> },
    ],
  },
  {
    heading: "Marketplace",
    items: [
      { key: "tutors", href: "/tutors", label: "Find a tutor", icon: <Glyph>🧑‍🏫</Glyph> },
      { key: "courses", href: "/courses", label: "Courses", icon: <Glyph>🎓</Glyph> },
      { key: "bookings", href: "/bookings", label: "My bookings", icon: <Glyph>📅</Glyph> },
      { key: "my-courses", href: "/courses-mine", label: "My purchases", icon: <Glyph>🛒</Glyph> },
    ],
  },
  {
    heading: "Me",
    items: [
      { key: "search", href: "/search", label: "Search", icon: <Glyph>🔍</Glyph> },
      { key: "saved", href: "/bookmarks", label: "Saved", icon: <Glyph>★</Glyph> },
      { key: "history", href: "/history", label: "History", icon: <Glyph>📜</Glyph> },
      { key: "profile", href: "/profile", label: "Profile", icon: <Glyph>👤</Glyph> },
      { key: "settings", href: "/settings", label: "Settings", icon: <Glyph>⚙</Glyph> },
    ],
  },
];

// Mobile bottom-tab bar — five slots per design-system-v2-aurora.md §7.3.
// Center slot is the "Quick practice" raised FAB.
const MOBILE_TABS: MobileTabBarItem[] = [
  { key: "home", href: "/home", label: "Home", icon: <Glyph size={22}>⚡</Glyph> },
  { key: "study", href: "/catalog", label: "Study", icon: <Glyph size={22}>📚</Glyph> },
  { key: "practice", href: "/practice", label: "Practice", icon: <Glyph size={22}>🎯</Glyph>, primary: true },
  { key: "battle", href: "/battle", label: "Battle", icon: <Glyph size={22}>⚔</Glyph> },
  { key: "profile", href: "/profile", label: "Me", icon: <Glyph size={22}>👤</Glyph> },
];

function Glyph({ children, size }: { children: ReactNode; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        fontSize: size ?? 18,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
      }}
    >
      {children}
    </span>
  );
}

// Map current pathname → activeKey. Mirrors the v1 logic so the same
// routes resolve to the same labels.
function activeKeyFor(pathname: string): string | undefined {
  if (pathname === "/" || pathname.startsWith("/home")) return "home";
  if (pathname.startsWith("/catalog") || pathname.startsWith("/study") || pathname.startsWith("/exams")) return "study";
  if (pathname.startsWith("/practice") || pathname.startsWith("/quiz") || pathname.startsWith("/mock") || pathname.startsWith("/pyq")) return "practice";
  if (pathname.startsWith("/plan")) return "plan";
  if (pathname.startsWith("/battle")) return "battle";
  if (pathname.startsWith("/friends")) return "friends";
  if (pathname.startsWith("/clans")) return "clans";
  if (pathname.startsWith("/leaderboards")) return "leaderboards";
  if (pathname.startsWith("/rank") || pathname.startsWith("/league")) return "rank";
  if (pathname.startsWith("/insights")) return "insights";
  if (pathname.startsWith("/analysis") || pathname.startsWith("/concept-profile") || pathname.startsWith("/diagnostic-deep-dive")) return "analysis";
  if (pathname.startsWith("/experts")) return "experts";
  if (pathname.startsWith("/doubts") || pathname.startsWith("/tutor-history")) return "doubts";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/tutors")) return "tutors";
  if (pathname.startsWith("/courses-mine")) return "my-courses";
  if (pathname.startsWith("/courses")) return "courses";
  if (pathname.startsWith("/bookings")) return "bookings";
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/bookmarks")) return "saved";
  if (pathname.startsWith("/history")) return "history";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/settings")) return "settings";
  return undefined;
}

export function AppShell({
  title,
  chips,
  actions,
  children,
  focusMode,
}: {
  title: string;
  chips?: TopbarChip[];
  actions?: ReactNode;
  children: ReactNode;
  /**
   * Hide the sidebar, topbar, and mobile tab bar (no chrome). Used by
   * the Practice Runner so students aren't distracted by navigation
   * during an active quiz session. Spec: redesign/practice-runner.md
   */
  focusMode?: boolean;
}): ReactNode {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const activeKey = activeKeyFor(pathname);

  // Short-circuit focus mode — render children inside a minimal shell.
  // The Quiz page provides its own session bar (back / timer / exit),
  // so dropping the AppShell chrome is the right call.
  if (focusMode) {
    return <UiAppShell focusMode>{children}</UiAppShell>;
  }
  const avatarUrl = useAvatar(user?.id ?? null);
  const initials = (user?.firstName ?? "?").slice(0, 1).toUpperCase();

  const brand = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundImage: "var(--aurora-ai)",
          color: "white",
          fontWeight: 800,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        A
      </span>
      <span
        className="alp-navsidebar__label"
        style={{ fontWeight: 700, color: "var(--neutral-900)" }}
      >
        AdaptiveLearn
      </span>
    </span>
  );

  const sidebarFooter = (
    <Link
      to="/profile"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        textDecoration: "none",
        color: "var(--neutral-700)",
        width: "100%",
      }}
      aria-label="Open profile"
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: "9999px",
          background: avatarUrl
            ? `center/cover url(${avatarUrl})`
            : "var(--brand-100)",
          color: "var(--brand-700)",
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {avatarUrl ? "" : initials}
      </span>
      <span className="alp-navsidebar__label" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        {user?.firstName ?? "Guest"}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          void logout();
        }}
        title="Sign out"
        aria-label="Sign out"
        className="alp-navsidebar__label"
        style={{
          background: "transparent",
          border: 0,
          color: "var(--neutral-500)",
          cursor: "pointer",
          padding: 4,
        }}
      >
        ⏻
      </button>
    </Link>
  );

  const sidebar: NavSidebarItem | unknown = null; // placeholder for clarity
  void sidebar;

  const topbar = (
    <TopBar
      breadcrumb={<strong style={{ color: "var(--neutral-900)" }}>{title}</strong>}
      trailing={
        <>
          {chips && chips.length > 0
            ? chips.map((c, i) => (
                <Tag key={i} tone="neutral" variant="soft" size="sm">
                  {c.live ? (
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "9999px",
                        background: "var(--success-500)",
                        display: "inline-block",
                        marginRight: 6,
                      }}
                    />
                  ) : null}
                  {c.label}
                </Tag>
              ))
            : null}
          <ThemeToggle />
          {actions}
          <InboxBell />
        </>
      }
    />
  );

  return (
    <UiAppShell
      sidebar={
        <NavSidebar
          brand={brand}
          groups={NAV_GROUPS}
          activeKey={activeKey}
          linkAs={RouterLink}
          footer={sidebarFooter}
        />
      }
      topbar={topbar}
      mobileTabBar={
        <MobileTabBar
          items={MOBILE_TABS}
          activeKey={activeKey}
          linkAs={RouterLink}
        />
      }
    >
      {children}
      {/* P6 S58 — global Cmd+K palette. Self-mounts; only renders the
          panel when open, so the AppShell DOM cost stays trivial. */}
      <CommandPalette />
    </UiAppShell>
  );
}
