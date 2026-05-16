// ResetPassword — Aurora redesign (split-screen).

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthError } from "@alp/auth-client";
import { Button, FormField, Input } from "@alp/ui";
import { auth } from "../lib/api";
import { Banner } from "../components/dashboard";
import "@alp/design-system/shell.css";

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError("Missing reset token. Please use the link from your email.");
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) return;

    setSubmitting(true);
    try {
      await auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(friendlyError(err));
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
          <div className="alp-authpage__tagline">Pick a fresh password.</div>
          <div className="alp-authpage__tagline-sub">
            All previous sessions will be signed out for safety.
          </div>
        </div>
        <div />
      </aside>

      <main className="alp-authpage__panel">
        {done ? (
          <div className="alp-authpage__form" aria-live="polite">
            <div className="alp-authpage__mobile-brand">
              <span className="alp-authpage__brand-mark">A</span>
              AdaptiveLearn
            </div>
            <header>
              <h1 className="alp-authpage__title">Password updated</h1>
              <p className="alp-authpage__subtitle">
                You can now log in with your new password. All previous sessions
                have been signed out.
              </p>
            </header>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate("/login", { replace: true })}
            >
              Go to log in
            </Button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="alp-authpage__form"
            aria-label="Reset password"
          >
            <div className="alp-authpage__mobile-brand">
              <span className="alp-authpage__brand-mark">A</span>
              AdaptiveLearn
            </div>
            <header>
              <h1 className="alp-authpage__title">Set a new password</h1>
              <p className="alp-authpage__subtitle">
                Pick a password you haven't used here before.
              </p>
            </header>

            {error ? (
              <Banner tone="danger" role="alert">
                {error}
              </Banner>
            ) : null}

            <FormField label="New password" helper="At least 12 characters.">
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                required
                minLength={12}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>

            <FormField label="Confirm new password">
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                required
                minLength={12}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </FormField>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={!token || submitting}
            >
              {submitting ? "Updating…" : "Update password"}
            </Button>

            <p style={{ margin: 0, textAlign: "center" }}>
              <Link
                to="/login"
                style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
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

function friendlyError(err: unknown): string {
  if (!(err instanceof AuthError)) return "Something went wrong. Please try again.";
  switch (err.code) {
    case "reset_token_invalid":
      return "This reset link has expired or already been used. Request a new one.";
    case "weak_password":
      return "That password is too weak. Try something longer or more unique.";
    case "rate_limited":
      return "Too many attempts. Please wait a moment.";
    default:
      return "We couldn't update your password. Please try again.";
  }
}