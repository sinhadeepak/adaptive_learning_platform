import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { AuthError } from "@alp/auth-client";
import { useAuth } from "../lib/auth-provider";
import { Banner } from "../components/dashboard";
import "@alp/design-system/shell.css";

interface LocationState {
  returnTo?: string;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [sessionExpired] = useState(
    () => new URLSearchParams(location.search).get("reason") === "expired",
  );

  useEffect(() => {
    if (sessionExpired) setError("Your session expired. Please log in again.");
  }, [sessionExpired]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await login(email, password, remember);
      const returnTo =
        (location.state as LocationState | null)?.returnTo ??
        sessionStorage.getItem("alp.auth.returnTo") ??
        "/home";
      sessionStorage.removeItem("alp.auth.returnTo");
      if (session.user.onboardingState !== "ONBOARDED") {
        navigate("/onboarding/exam", { replace: true });
      } else {
        navigate(returnTo, { replace: true });
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <main className="auth-card">
        <div className="auth-mark">
          <div className="sidebar-mark">A</div>
          <span className="sidebar-mark-text">AdaptiveLearn</span>
        </div>
        <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
          Log in
        </h1>
        <p className="page-subhead">Welcome back, learner.</p>

        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}

        <form onSubmit={onSubmit} className="auth-form" aria-label="Log in">
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
          <label className="form-field">
            <span className="form-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
            />
          </label>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sp-2)",
                color: "var(--text-secondary)",
              }}
            >
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            <Link to="/forgot-password" className="auth-link">
              Forgot?
            </Link>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="auth-footer">
          New here?{" "}
          <Link to="/register" className="auth-link">
            Sign up
          </Link>
        </p>
      </main>
    </div>
  );
}

function friendlyError(err: unknown): string {
  if (!(err instanceof AuthError)) return "Unexpected error — please try again.";
  switch (err.code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "locked":
      return "Too many attempts. Try again in a few minutes.";
    case "rate_limited":
      return "Too many login attempts. Please wait a moment.";
    case "network":
      return "We couldn't reach the server. Check your connection.";
    default:
      return "Something went wrong. Please try again.";
  }
}
