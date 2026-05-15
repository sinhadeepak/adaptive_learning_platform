// ForgotPassword — Aurora redesign (split-screen).
//
// Spec: docs/02-design/design-system-v2-aurora.md §8.2.1

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, FormField, Input } from "@alp/ui";
import { auth } from "../lib/api";
import { Banner } from "../components/dashboard";
import "@alp/design-system/shell.css";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.forgotPassword(email);
      setSubmitted(true);
    } catch {
      setError("We couldn't send the reset link. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="alp-authpage">
      <aside className="alp-authpage__illustration" aria-hidden>
        <div className="alp-authpage__brand">
          <span className="alp-authpage__brand-mark">A</span>
          AdaptiveLearn
        </div>
        <div>
          <div className="alp-authpage__tagline">Locked out? No worries.</div>
          <div className="alp-authpage__tagline-sub">
            We'll email you a fresh reset link — valid for 30 minutes.
          </div>
        </div>
        <div />
      </aside>

      <main className="alp-authpage__panel">
        {submitted ? (
          <div className="alp-authpage__form" aria-live="polite">
            <div className="alp-authpage__mobile-brand">
              <span className="alp-authpage__brand-mark">A</span>
              AdaptiveLearn
            </div>
            <header>
              <h1 className="alp-authpage__title">Check your inbox</h1>
              <p className="alp-authpage__subtitle">
                If an account exists for <strong>{email}</strong>, we've sent a
                password-reset link. The link is valid for 30 minutes.
              </p>
            </header>
            <p style={{ color: "var(--neutral-500)", fontSize: 13, margin: 0 }}>
              Didn't get one? Check your spam folder, or{" "}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                style={{
                  background: "none",
                  border: 0,
                  padding: 0,
                  color: "var(--brand-600)",
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontWeight: 600,
                }}
              >
                try a different email
              </button>
              .
            </p>
            <p style={{ margin: 0, textAlign: "center" }}>
              <Link
                to="/login"
                style={{ color: "var(--brand-600)", textDecoration: "none", fontWeight: 600 }}
              >
                ← Back to log in
              </Link>
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="alp-authpage__form"
            aria-label="Forgot password"
          >
            <div className="alp-authpage__mobile-brand">
              <span className="alp-authpage__brand-mark">A</span>
              AdaptiveLearn
            </div>
            <header>
              <h1 className="alp-authpage__title">Forgot your password?</h1>
              <p className="alp-authpage__subtitle">
                Enter the email you signed up with and we'll send you a reset link.
              </p>
            </header>

            {error ? (
              <Banner tone="danger" role="alert">
                {error}
              </Banner>
            ) : null}

            <FormField label="Email" required>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Send reset link"}
            </Button>

            <p style={{ margin: 0, textAlign: "center" }}>
              <Link
                to="/login"
                style={{ color: "var(--brand-600)", textDecoration: "none", fontWeight: 600 }}
              >
                ← Back to log in
              </Link>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
