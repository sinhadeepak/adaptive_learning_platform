import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
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

  if (submitted) {
    return (
      <div className="auth-page">
        <main className="auth-card">
          <h1 className="page-greeting" style={{ marginBottom: "var(--sp-3)" }}>
            Check your inbox
          </h1>
          <p style={{ color: "var(--text-primary)", fontSize: 13, lineHeight: 1.5 }}>
            If an account exists for <strong>{email}</strong>, we've sent a
            password-reset link. The link is valid for 30 minutes.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: "var(--sp-3)" }}>
            Didn't get one? Check your spam folder, or{" "}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="auth-link-button"
            >
              try a different email
            </button>
            .
          </p>
          <p className="auth-footer">
            <Link to="/login" className="auth-link">
              ← Back to log in
            </Link>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <main className="auth-card">
        <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
          Forgot your password?
        </h1>
        <p className="page-subhead">
          Enter the email you signed up with and we'll send you a reset link.
        </p>

        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}

        <form onSubmit={onSubmit} className="auth-form" aria-label="Forgot password">
          <label className="form-field">
            <span className="form-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
          >
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/login" className="auth-link">
            ← Back to log in
          </Link>
        </p>
      </main>
    </div>
  );
}
