// Sprint 8 F-2 — paywall modal.
//
// Shown when a free-tier student hits a premium gate (mock-mode 403,
// photo-doubt 429, etc.). Single CTA: "Upgrade to Premium" → starts a
// Stripe Checkout session and redirects to `session.url`. In stub mode
// (no STRIPE_API_KEY on the backend) this flow is identical — the URL
// is the local /billing?status=success&session_id=cs_stub_… lander
// handled by the same Billing page.
import { useState } from "react";
import { startCheckout, type CheckoutPlan } from "../lib/billing";

interface PaywallModalProps {
  open: boolean;
  reason: string;
  onClose: () => void;
}

export function PaywallModal({ open, reason, onClose }: PaywallModalProps) {
  const [plan, setPlan] = useState<CheckoutPlan>("premium_monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const s = await startCheckout(plan);
      window.location.assign(s.url);
    } catch (err) {
      setError((err as Error).message || "Checkout failed — please retry.");
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to Premium"
      className="paywall-overlay"
      onClick={onClose}
    >
      <div className="paywall-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="paywall-title">Upgrade to Premium</h2>
        <p className="paywall-reason">{reason}</p>
        <ul className="paywall-benefits">
          <li>Unlimited AI mock tests with rank projection</li>
          <li>Unlimited photo-doubt resolution</li>
          <li>Personalised study plan + AI tutor</li>
          <li>Cross-topic weakness diagnosis</li>
        </ul>
        <fieldset className="paywall-plans">
          <label>
            <input
              type="radio"
              name="plan"
              value="premium_monthly"
              checked={plan === "premium_monthly"}
              onChange={() => setPlan("premium_monthly")}
            />
            Monthly · ₹499/mo
          </label>
          <label>
            <input
              type="radio"
              name="plan"
              value="premium_yearly"
              checked={plan === "premium_yearly"}
              onChange={() => setPlan("premium_yearly")}
            />
            Yearly · ₹3,999/yr (save 33%)
          </label>
        </fieldset>
        {error && <p className="paywall-error">{error}</p>}
        <div className="paywall-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Maybe later
          </button>
          <button className="btn-primary" onClick={go} disabled={busy}>
            {busy ? "Redirecting…" : "Upgrade now"}
          </button>
        </div>
      </div>
    </div>
  );
}
