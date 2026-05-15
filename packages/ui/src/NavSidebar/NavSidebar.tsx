// NavSidebar — Aurora organism (md+ navigation).
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.3
//
// Responsive states:
//   md (768–1023)   — collapsed: icons-only, 64px wide
//   lg (1024–1279)  — collapsed: icons-only (same as md), 64px
//   xl (1280+)      — expanded: icons + labels + group headings, 220px
//
// The state is computed from viewport via CSS (no JS resize listener)
// — the inner labels are display:none below `--bp-xl`. This keeps the
// component zero-cost on resize.
//
// Items are passed as data, with grouping. Active item is matched by
// `activeKey` (caller-provided, derived from the current route).
//
// At xs/sm the NavSidebar isn't rendered (AppShell uses MobileTabBar
// instead). NavSidebar still works standalone if mounted inside a Sheet.

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export interface NavSidebarItem {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface NavSidebarGroup {
  /** Group heading, shown only when sidebar is expanded (xl+). */
  heading?: React.ReactNode;
  items: NavSidebarItem[];
}

export interface NavSidebarProps extends React.HTMLAttributes<HTMLElement> {
  /** Branding slot — typically a Logo + product name. */
  brand?: React.ReactNode;
  /** Active item key — match by `item.key`. */
  activeKey?: string;
  groups: NavSidebarGroup[];
  /** Footer slot at the bottom of the sidebar (e.g. user avatar menu). */
  footer?: React.ReactNode;
  /** Render <a> tags via this wrapper (e.g. React Router Link). */
  linkAs?: React.ComponentType<{ to: string; children: React.ReactNode; className?: string; "aria-current"?: "page" | undefined }>;
}

function NavRow({
  item,
  active,
  linkAs: LinkAs,
}: {
  item: NavSidebarItem;
  active: boolean;
  linkAs?: NavSidebarProps["linkAs"];
}) {
  const content = (
    <>
      {item.icon ? <span className="alp-navsidebar__icon" aria-hidden="true">{item.icon}</span> : null}
      <span className="alp-navsidebar__label">{item.label}</span>
      {item.badge !== undefined && item.badge !== null ? (
        <span className="alp-navsidebar__badge">{item.badge}</span>
      ) : null}
    </>
  );
  const className = cn(
    "alp-navsidebar__item",
    active && "alp-navsidebar__item--active",
    item.disabled && "alp-navsidebar__item--disabled",
  );
  if (item.href && LinkAs) {
    return (
      <li>
        <LinkAs to={item.href} className={className} aria-current={active ? "page" : undefined}>
          {content}
        </LinkAs>
      </li>
    );
  }
  if (item.href) {
    return (
      <li>
        <a
          href={item.href}
          className={className}
          aria-current={active ? "page" : undefined}
          aria-disabled={item.disabled || undefined}
          onClick={item.disabled ? (e) => e.preventDefault() : undefined}
        >
          {content}
        </a>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        className={className}
        onClick={item.onClick}
        disabled={item.disabled}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </button>
    </li>
  );
}

export const NavSidebar = forwardRef<HTMLElement, NavSidebarProps>(function NavSidebar(
  { brand, activeKey, groups, footer, linkAs, className, ...rest },
  ref,
) {
  return (
    <nav
      ref={ref}
      className={cn("alp-navsidebar", className)}
      aria-label="Primary navigation"
      {...rest}
    >
      {brand ? <div className="alp-navsidebar__brand">{brand}</div> : null}
      <div className="alp-navsidebar__scroll">
        {groups.map((g, gi) => (
          <div key={gi} className="alp-navsidebar__group">
            {g.heading ? (
              <div className="alp-navsidebar__heading">{g.heading}</div>
            ) : null}
            <ul className="alp-navsidebar__list">
              {g.items.map((it) => (
                <NavRow
                  key={it.key}
                  item={it}
                  active={activeKey === it.key}
                  linkAs={linkAs}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {footer ? <div className="alp-navsidebar__footer">{footer}</div> : null}
    </nav>
  );
});
