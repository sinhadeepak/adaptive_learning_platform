import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthError } from "@alp/auth-client";
import { useAuth } from "../lib/auth-provider";
import { Banner } from "../components/primitives";
import "@alp/design-system/shell.css";
import "../styles/shell.css";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? "/questions";

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
      if (err instanceof AuthError) {
        if (err.code === "invalid_credentials") setError("Email or password is incorrect.");
        else if (err.code === "rate_limited") setError("Too many attempts — wait a minute and retry.");
        else if (err.code === "locked") setError("Account locked — contact your admin.");
        else setError("Login failed. Try again.");
      } else {
        setError("Login failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <main className="auth-card">
        <div className="auth-mark">
          <div className="sidebar-mark">A</div>
          <span className="sidebar-mark-text">Educator</span>
        </div>
        <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
          Sign in
        </h1>
        <p className="page-subhead">
          For teachers, experts, and moderators. Students should use the student app.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="form-field">
            <span className="form-label">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
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
              autoComplete="current-password"
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
