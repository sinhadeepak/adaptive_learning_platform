// Sprint 8 F-4 — premiumDisplay() copy-derivation tests.
//
// The Profile page + sidebar pill consume the {label, badgeClass, caption}
// shape this function returns. Pinning the contract here means that
// changing renewal copy (or the cancel-at-period-end UX) shows up as a
// failed test rather than a silent UI shift.

import { describe, expect, test } from "vitest";

import { premiumDisplay, type SubscriptionSummary } from "./billing";

function sub(overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary {
  return {
    tier: "STUDENT_FREE",
    status: "INACTIVE",
    isPremium: false,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe("premiumDisplay", () => {
  test("null sub → free + upsell caption", () => {
    const got = premiumDisplay(null);
    expect(got.label).toBe("Free");
    expect(got.badgeClass).toBe("pill-neutral");
    expect(got.caption).toMatch(/upgrade/i);
  });

  test("free tier (not premium) → free + upsell caption", () => {
    const got = premiumDisplay(sub());
    expect(got.label).toBe("Free");
    expect(got.badgeClass).toBe("pill-neutral");
  });

  test("active premium → Premium label + renewal caption", () => {
    const got = premiumDisplay(
      sub({
        tier: "STUDENT_PREMIUM",
        status: "ACTIVE",
        isPremium: true,
        periodEnd: "2026-12-01T00:00:00Z",
      }),
    );
    expect(got.label).toBe("Premium");
    expect(got.badgeClass).toBe("pill-premium");
    expect(got.caption).toMatch(/renews/i);
  });

  test("PAST_DUE keeps Premium pill but signals payment issue", () => {
    const got = premiumDisplay(
      sub({
        tier: "STUDENT_PREMIUM",
        status: "PAST_DUE",
        isPremium: true,
        periodEnd: "2026-06-01T00:00:00Z",
      }),
    );
    expect(got.label).toMatch(/payment issue/i);
    expect(got.badgeClass).toBe("pill-warn");
  });

  test("CANCELED with future period_end → Cancelling pill", () => {
    const got = premiumDisplay(
      sub({
        tier: "STUDENT_PREMIUM",
        status: "CANCELED",
        isPremium: true,
        periodEnd: "2026-06-01T00:00:00Z",
        cancelAtPeriodEnd: true,
      }),
    );
    expect(got.label).toMatch(/cancelling/i);
    expect(got.badgeClass).toBe("pill-warn");
    expect(got.caption).toMatch(/reactivate/i);
  });

  test("active premium without period_end → Premium without caption", () => {
    const got = premiumDisplay(
      sub({
        tier: "STUDENT_PREMIUM",
        status: "ACTIVE",
        isPremium: true,
        periodEnd: null,
      }),
    );
    expect(got.label).toBe("Premium");
    expect(got.caption).toBeNull();
  });
});
