import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthError } from "@alp/auth-client";
import { useAuth } from "../lib/auth-provider";
import { Banner } from "../components/primitives";
import "../styles/shell.css";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? "/flags";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      if (err instanceof AuthError && err.code === "invalid_credentials") {
        setError("Email or password is incorrect.");
      } else if (err instanceof AuthError && err.code === "rate_limited") {
        setError("Too many attempts — wait a minute.");
      } else {
        setError("Login failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page app-shell">
      <main className="auth-card">
        <div className="auth-mark">
          <div className="sidebar-mark">A</div>
          <span className="sidebar-mark-text">Admin</span>
        </div>
        <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
          Admin sign-in
        </h1>
        <p className="page-subhead">
          Restricted to institution and platform admins.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="form-field">
            <span className="form-label">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
            />
          </label>

          {error ? (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary btn-block"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
