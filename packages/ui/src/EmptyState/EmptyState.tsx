// EmptyState — Aurora primitive (molecule, depends only on text).
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.2 + §9.5
//
// One unified empty-state component. Three tiers of richness:
//   * Junior density: pair with an illustrated `illustration` slot
//     (mascot or aurora illustration) for warmer empty states.
//   * Aspirant density: pair with a single Lucide icon as illustration.
//   * Pro density: omit illustration entirely.
//
// Actions are caller-supplied so they can be Buttons of any variant.

import React, { forwardRef } from "react";
import { cn } from "../utils/cn";

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Image / icon / illustration content rendered in the avatar-style halo. */
  illustration?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Action(s) — typically <Button> elements. */
  actions?: React.ReactNode;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState({ illustration, title, description, actions, className, ...rest }, ref) {
    return (
      <div ref={ref} className={cn("alp-empty", className)} {...rest}>
        {illustration ? (
          <div className="alp-empty__illustration" aria-hidden="true">
            {illustration}
          </div>
        ) : null}
        <h3 className="alp-empty__title">{title}</h3>
        {description ? (
          <p className="alp-empty__description">{description}</p>
        ) : null}
        {actions ? <div className="alp-empty__actions">{actions}</div> : null}
      </div>
    );
  },
);
