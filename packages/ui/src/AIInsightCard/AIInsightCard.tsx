// AIInsightCard — Aurora organism.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.3 + §9.3
//
// Aurora-gradient surface that says "this came from the AI engine".
// Replaces the inline "AI Recommends" banners across Home, Topic
// detail, Analysis. The gradient is the engagement layer's tonal
// anchor for AI moments.

import React, { forwardRef } from "react";
import { Card } from "../Card";
import { cn } from "../utils/cn";

export interface AIInsightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short eyebrow above the headline, e.g. "AI INSIGHT". */
  eyebrow?: React.ReactNode;
  /** Main headline. Keep ≤ 12 words. */
  headline: React.ReactNode;
  /** Optional supporting copy under the headline. ≤ 22 words. */
  description?: React.ReactNode;
  /** CTA — typically <Button variant="aurora">. */
  action?: React.ReactNode;
}

export const AIInsightCard = forwardRef<HTMLDivElement, AIInsightCardProps>(
  function AIInsightCard(
    { eyebrow = "AI INSIGHT", headline, description, action, className, ...rest },
    ref,
  ) {
    return (
      <Card
        ref={ref}
        tone="aurora-ai"
        padding="md"
        className={cn("alp-aicard", className)}
        {...rest}
      >
        <div className="alp-aicard__eyebrow">
          <span className="alp-aicard__sparkle" aria-hidden="true">✦</span>
          {eyebrow}
        </div>
        <div className="alp-aicard__headline">{headline}</div>
        {description ? (
          <div className="alp-aicard__description">{description}</div>
        ) : null}
        {action ? <div className="alp-aicard__action">{action}</div> : null}
      </Card>
    );
  },
);
