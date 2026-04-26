import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthError } from "@alp/auth-client";
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

  if (done) {
    return (
      <div className="auth-page">
        <main className="auth-card">
          <h1 className="page-greeting" style={{ marginBottom: "var(--sp-3)" }}>
            Password updated
          </h1>
          <p style={{ color: "var(--text-primary)", fontSize: 13, lineHeight: 1.5 }}>
            You can now log in with your new password. All previous sessions have
            been signed out.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: "var(--sp-4)" }}
            onClick={() => navigate("/login", { replace: true })}
          >
            Go to log in
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <main className="auth-card">
        <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
          Set a new password
        </h1>
        <p className="page-subhead">Pick a password you haven't used here before.</p>

        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}

        <form onSubmit={onSubmit} className="auth-form" aria-label="Reset password">
          <div className="form-field">
            <label className="form-field" style={{ gap: 6 }}>
              <span className="form-label">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                required
                minLength={12}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </label>
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              At least 12 characters.
            </span>
          </div>

          <label className="form-field">
            <span className="form-label">Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              required
              minLength={12}
              onChange={(e) => setConfirm(e.target.value)}
              className="form-input"
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={!token || submitting}
          >
            {submitting ? "Updating…" : "Update password"}
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
