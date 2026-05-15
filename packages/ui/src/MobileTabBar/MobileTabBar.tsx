// MobileTabBar — Aurora organism (xs/sm navigation).
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.3
//
// Fixed-bottom 5-slot tab bar for xs/sm. Center slot may be raised
// as a FAB-style primary action (e.g. "Quick practice"). Each item
// supports a badge (unread count). At md+ this component renders
// nothing — AppShell switches to NavSidebar.

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export interface MobileTabBarItem {
  key: string;
  label: React.ReactNode;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  badge?: React.ReactNode;
  /** When true, this slot renders raised (FAB-style). Use sparingly — one per bar. */
  primary?: boolean;
}

export interface MobileTabBarProps extends React.HTMLAttributes<HTMLElement> {
  activeKey?: string;
  /** Exactly 5 items recommended; renders any count but visual rhythm assumes 5. */
  items: MobileTabBarItem[];
  linkAs?: React.ComponentType<{ to: string; children: React.ReactNode; className?: string; "aria-current"?: "page" | undefined }>;
}

export const MobileTabBar = forwardRef<HTMLElement, MobileTabBarProps>(
  function MobileTabBar({ activeKey, items, linkAs: LinkAs, className, ...rest }, ref) {
    return (
      <nav
        ref={ref}
        className={cn("alp-mobiletabbar", className)}
        aria-label="Primary navigation"
        {...rest}
      >
        <ul className="alp-mobiletabbar__list">
          {items.map((it) => {
            const active = activeKey === it.key;
            const itemClass = cn(
              "alp-mobiletabbar__item",
              active && "alp-mobiletabbar__item--active",
              it.primary && "alp-mobiletabbar__item--primary",
            );
            const content = (
              <>
                <span className="alp-mobiletabbar__icon" aria-hidden="true">{it.icon}</span>
                <span className="alp-mobiletabbar__label">{it.label}</span>
                {it.badge !== undefined && it.badge !== null ? (
                  <span className="alp-mobiletabbar__badge">{it.badge}</span>
                ) : null}
              </>
            );
            if (it.href && LinkAs) {
              return (
                <li key={it.key} className="alp-mobiletabbar__slot">
                  <LinkAs to={it.href} className={itemClass} aria-current={active ? "page" : undefined}>
                    {content}
                  </LinkAs>
                </li>
              );
            }
            if (it.href) {
              return (
                <li key={it.key} className="alp-mobiletabbar__slot">
                  <a href={it.href} className={itemClass} aria-current={active ? "page" : undefined}>
                    {content}
                  </a>
                </li>
              );
            }
            return (
              <li key={it.key} className="alp-mobiletabbar__slot">
                <button
                  type="button"
                  className={itemClass}
                  onClick={it.onClick}
                  aria-current={active ? "page" : undefined}
                >
                  {content}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  },
);
