// AppShell — Aurora organism (responsive layout switch).
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.3
//
// Composes NavSidebar (md+) + TopBar + main content + MobileTabBar (xs/sm).
// The split is CSS-driven via the existing breakpoint tokens — no JS
// resize listener.
//
//   xs/sm  : TopBar (compact) + main + MobileTabBar (sticky bottom)
//   md+    : NavSidebar (icons; expands at xl) + TopBar + main
//
// The sidebar / topbar / mobile-tab-bar are passed as slots so each
// app can wire its own routes (web-student vs web-portal vs admin).

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  sidebar?: React.ReactNode;
  topbar?: React.ReactNode;
  mobileTabBar?: React.ReactNode;
  children: React.ReactNode;
  /** Use to hide the shell entirely (PracticeRunner focus mode). */
  focusMode?: boolean;
}

export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(function AppShell(
  { sidebar, topbar, mobileTabBar, children, focusMode, className, ...rest },
  ref,
) {
  if (focusMode) {
    return (
      <div ref={ref} className={cn("alp-appshell alp-appshell--focus", className)} {...rest}>
        <main className="alp-appshell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
    );
  }
  return (
    <div ref={ref} className={cn("alp-appshell", className)} {...rest}>
      <a href="#main" className="alp-appshell__skiplink">Skip to main content</a>
      {sidebar ? <aside className="alp-appshell__sidebar">{sidebar}</aside> : null}
      <div className="alp-appshell__column">
        {topbar ? topbar : null}
        <main id="main" className="alp-appshell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
      {mobileTabBar ? <div className="alp-appshell__tabbar">{mobileTabBar}</div> : null}
    </div>
  );
});
