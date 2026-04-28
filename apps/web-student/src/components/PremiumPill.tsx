// Sprint 8 F-4 — Premium pill component used by Profile + sidebar.
//
// Lives in its own component so we have one place to update the styling
// and one place to fetch /payment/me. Memoizes the fetch result for the
// session so a cold sidebar render doesn't refetch on every nav.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchSubscription,
  premiumDisplay,
  type SubscriptionSummary,
} from "../lib/billing";

let cached: SubscriptionSummary | null = null;
let cachedPromise: Promise<SubscriptionSummary> | null = null;

async function load(): Promise<SubscriptionSummary> {
  if (cached) return cached;
  if (!cachedPromise) {
    cachedPromise = fetchSubscription()
      .then((s) => {
        cached = s;
        return s;
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }
  return cachedPromise;
}

interface PremiumPillProps {
  variant?: "compact" | "card";
}

export function PremiumPill({ variant = "compact" }: PremiumPillProps) {
  const [sub, setSub] = useState<SubscriptionSummary | null>(cached);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((s) => {
        if (!cancelled) setSub(s);
      })
      .catch(() => {
        // 401 / network errors → render the free-tier upsell, never a broken pill.
        if (!cancelled) setSub(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const display = premiumDisplay(sub);

  if (variant === "compact") {
    return (
      <Link to="/billing" className={`pill ${display.badgeClass} pill-link`}>
        {display.label}
      </Link>
    );
  }

  return (
    <Link to="/billing" className="premium-pill-card">
      <span className={`pill ${display.badgeClass}`}>{display.label}</span>
      {display.caption && (
        <span className="premium-pill-caption">{display.caption}</span>
      )}
    </Link>
  );
}
