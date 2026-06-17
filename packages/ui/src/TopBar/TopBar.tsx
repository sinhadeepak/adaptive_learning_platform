// TopBar — Aurora organism.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.3
//
// One sticky top bar across every authenticated screen. Slots:
//   * leading     — typically a Logo (or hamburger at xs/sm)
//   * breadcrumb  — page / route context
//   * search      — Cmd-K trigger Button or inline Combobox
//   * trailing    — StreakChip + Bell + Avatar menu (caller-supplied)
//
// At xs/sm the breadcrumb collapses to "..." menu; the bar shrinks
// to 56px high; primary leading slot is the hamburger which opens
// the Sheet-as-mobile-nav (caller wires that up to MobileTabBar
// expanded view if needed).

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export interface TopBarProps extends React.HTMLAttributes<HTMLElement> {
  leading?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  search?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const TopBar = forwardRef<HTMLElement, TopBarProps>(function TopBar(
  { leading, breadcrumb, search, trailing, className, ...rest },
  ref,
) {
  return (
    <header
      ref={ref}
      className={cn("alp-topbar", className)}
      role="banner"
      {...rest}
    >
      <div className="alp-topbar__leading">{leading}</div>
      <div className="alp-topbar__breadcrumb">{breadcrumb}</div>
      <div className="alp-topbar__search">{search}</div>
      <div className="alp-topbar__trailing">{trailing}</div>
    </header>
  );
});
