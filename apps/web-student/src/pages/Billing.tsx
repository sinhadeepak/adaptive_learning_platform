// Sprint 8 F-1 + F-3 — Billing page.
//
// Three states this page renders for:
//   1. ?status=success&session_id=cs_<id> — post-Checkout lander. Polls
//      /payment/me until isPremium flips true (or 30s timeout) so the
//      user sees the elevation immediately even though the elevation
//      itself comes from a webhook → NATS → Auth chain.
//   2. ?status=cancel — user backed out. Friendly "no charge" copy.
//   3. No query — current subscription summary + plan picker for users
//      who navigated here from /profile.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { PaywallModal } from "../components/PaywallModal";
import {
  fetchSubscription,
  premiumDisplay,
  type SubscriptionSummary,
} from "../lib/billing";

const POLL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

export function Billing() {
  const [params] = useSearchParams();
  const status = params.get("status");
  const [sub, setSub] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let elapsed = 0;
    async function once() {
      try {
        const s = await fetchSubscription();
        if (cancelled) return;
        setSub(s);
        setLoading(false);
        // After a Stripe Checkout success, /payment/me may briefly still
        // show free until the webhook lands — poll until premium flips
        // on, or until POLL_TIMEOUT_MS elapses.
        if (status === "success" && !s.isPremium && elapsed < POLL_TIMEOUT_MS) {
          elapsed += POLL_MS;
          setTimeout(once, POLL_MS);
        } else if (status === "success" && !s.isPremium) {
          setPollExhausted(true);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    once();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const display = premiumDisplay(sub);

  return (
    <AppShell title="Billing & Subscription">
      <main className="billing-page">
        <h1>Billing &amp; Subscription</h1>

        {status === "success" && (
          <section className="billing-banner billing-banner-success">
            <strong>Welcome to Premium!</strong>
            {sub?.isPremium ? (
              <p>
                Your subscription is active. Thanks for supporting the platform.
              </p>
            ) : pollExhausted ? (
              <p>
                Payment received. Your account elevation is taking longer than
                usual — refresh in a minute, or contact support if you don't
                see Premium turn on.
              </p>
            ) : (
              <p>Confirming your subscription with Stripe…</p>
            )}
          </section>
        )}

        {status === "cancel" && (
          <section className="billing-banner billing-banner-info">
            <strong>Checkout cancelled — no charge made.</strong>
            <p>Hop back in any time you're ready to upgrade.</p>
          </section>
        )}

        {loading ? (
          <p>Loading your subscription…</p>
        ) : (
          <section className="billing-card">
            <div className="billing-row">
              <span className="billing-label">Current plan</span>
              <span className={`pill ${display.badgeClass}`}>
                {display.label}
              </span>
            </div>
            {display.caption && (
              <p className="billing-caption">{display.caption}</p>
            )}
            {sub?.periodEnd && (
              <div className="billing-row">
                <span className="billing-label">Renewal date</span>
                <span>{new Date(sub.periodEnd).toLocaleDateString()}</span>
              </div>
            )}
            {!sub?.isPremium && (
              <button
                className="btn-primary billing-cta"
                onClick={() => setShowPaywall(true)}
              >
                Upgrade to Premium
              </button>
            )}
          </section>
        )}

        <PaywallModal
          open={showPaywall}
          reason="Unlock unlimited mocks, photo-doubts, and the AI tutor."
          onClose={() => setShowPaywall(false)}
        />
      </main>
    </AppShell>
  );
}
