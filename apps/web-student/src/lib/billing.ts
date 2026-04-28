// Sprint 8 F-1..F-5 — Payment service client wrapper for the web-student
// surface. Wraps the four endpoints we hit:
//   GET  /payment/me                            — current subscription
//   POST /payment/checkout/session              — start Stripe Checkout
//   GET  /payment/internal/users/:id/premium    — back-channel premium check
//
// All calls go through the shared `api` instance so the auth + retry +
// session-expired plumbing is identical to every other surface.

import { api } from "./api";

export interface SubscriptionSummary {
  tier: "STUDENT_FREE" | "STUDENT_PREMIUM";
  status: string;
  isPremium: boolean;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
  stripeMode: "live" | "stub";
}

export type CheckoutPlan = "premium_monthly" | "premium_yearly";

export async function fetchSubscription(): Promise<SubscriptionSummary> {
  return api.get<SubscriptionSummary>("/payment/me");
}

export async function startCheckout(
  plan: CheckoutPlan = "premium_monthly",
  tenantId: string | null = null,
): Promise<CheckoutSession> {
  return api.post<CheckoutSession>("/payment/checkout/session", {
    plan,
    tenantId,
  });
}

// Pure helper — derives the badge/copy shown on Profile from the
// /payment/me response. Extracted so it can be unit-tested.
export function premiumDisplay(sub: SubscriptionSummary | null): {
  label: string;
  badgeClass: string;
  caption: string | null;
} {
  if (!sub || !sub.isPremium) {
    return {
      label: "Free",
      badgeClass: "pill-neutral",
      caption: "Upgrade to unlock unlimited mocks + photo doubts.",
    };
  }
  if (sub.status === "PAST_DUE") {
    return {
      label: "Premium · Payment Issue",
      badgeClass: "pill-warn",
      caption: "We're retrying your payment. Premium features stay on for now.",
    };
  }
  if (sub.cancelAtPeriodEnd && sub.periodEnd) {
    const end = new Date(sub.periodEnd).toLocaleDateString();
    return {
      label: "Premium · Cancelling",
      badgeClass: "pill-warn",
      caption: `Cancels at end of cycle (${end}). Reactivate any time before then.`,
    };
  }
  return {
    label: "Premium",
    badgeClass: "pill-premium",
    caption: sub.periodEnd
      ? `Renews ${new Date(sub.periodEnd).toLocaleDateString()}`
      : null,
  };
}
