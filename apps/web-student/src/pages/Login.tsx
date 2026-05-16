// Login — Aurora redesign (split-screen).
//
// Spec: docs/02-design/design-system-v2-aurora.md §8.2.1
// ADR:  docs/adr/0028-design-system-v2-aurora.md (S8 deliverable)

import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { AuthError } from "@alp/auth-client";
import { Button, Checkbox, FormField, Input } from "@alp/ui";
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
    <div className="alp-authpage">
      {/* ── Illustration column (md+) ── */}
      <aside className="alp-authpage__illustration" aria-hidden>
        <div className="alp-authpage__brand">
          <span className="alp-authpage__brand-mark">A</span>
          AdaptiveLearn
        </div>
        <div>
          <div className="alp-authpage__tagline">
            Practice smarter. Improve faster.
          </div>
          <div className="alp-authpage__tagline-sub">
            Your AI coach picks the next question at your level — and remembers
            what you've already mastered.
          </div>
        </div>
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          🔥 30M+ questions practiced this month
        </div>
      </aside>

      {/* ── Form column ── */}
      <main className="alp-authpage__panel">
        <form
          onSubmit={onSubmit}
          className="alp-authpage__form"
          aria-label="Log in"
        >
          <div className="alp-authpage__mobile-brand">
            <span className="alp-authpage__brand-mark">A</span>
            AdaptiveLearn
          </div>
          <header>
            <h1 className="alp-authpage__title">Log in</h1>
            <p className="alp-authpage__subtitle">Welcome back, learner.</p>
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

          <FormField label="Password" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

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
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                color: "var(--ink-2)",
              }}
            >
              <Checkbox
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            <Link
              to="/forgot-password"
              style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
            >
              Forgot?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
          >
            {submitting ? "Logging in…" : "Log in"}
          </Button>

          <p
            style={{
              textAlign: "center",
              margin: 0,
              color: "var(--ink-3)",
              fontSize: 14,
            }}
          >
            New here?{" "}
            <Link
              to="/register"
              style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
            >
              Sign up
            </Link>
          </p>
        </form>
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