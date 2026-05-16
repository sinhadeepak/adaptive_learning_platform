// Login — Vidya v1 redesign (split-screen, black rail + editorial form).
//
// Spec: docs/02-design/design-system/04_components.md
//       + the 10-screen mockup set delivered with Vidya v1.
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// The OTP and Google buttons are wired as visible affordances; their
// backend handlers are placeholders until the OTP issuer and OAuth
// callbacks land (tracked in ADR-0034 §3 follow-ups).

import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { AuthError } from "@alp/auth-client";
import { useAuth } from "../lib/auth-provider";

interface LocationState {
  returnTo?: string;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      const session = await login(identifier, password, false);
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
    <div className="vidya-auth">
      <VidyaAuthRail />

      <main className="vidya-auth__panel">
        <form
          onSubmit={onSubmit}
          className="vidya-auth__form"
          aria-label="Log in"
        >
          <div className="vidya-auth__mobile-brand">
            v<em>⌑</em>dya
          </div>

          <header>
            <p className="vidya-auth__eyebrow">Log in</p>
            <h1 className="vidya-auth__title">Welcome back.</h1>
            <p className="vidya-auth__subtitle">
              Continue your preparation where you left off.
            </p>
          </header>

          {error ? (
            <div className="vidya-auth__error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}

          <label className="vidya-auth__field">
            <span className="vidya-auth__field-label">
              Mobile number or email
            </span>
            <input
              className="vidya-auth__field-input"
              type="text"
              autoComplete="username"
              value={identifier}
              required
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </label>

          <label className="vidya-auth__field">
            <span className="vidya-auth__field-label">Password</span>
            <input
              className="vidya-auth__field-input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="vidya-auth__field-suffix"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </label>

          <div className="vidya-auth__meta">
            <span>&nbsp;</span>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          <button
            type="submit"
            className="vidya-auth__cta"
            disabled={submitting}
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>

          <div className="vidya-auth__divider" role="separator">
            <span>or</span>
          </div>

          <div className="vidya-auth__secondary-row">
            <button
              type="button"
              className="vidya-auth__secondary"
              onClick={() => setError("Google sign-in is coming soon.")}
            >
              <GoogleGlyph />
              Google
            </button>
            <button
              type="button"
              className="vidya-auth__secondary"
              onClick={() => navigate("/forgot-password")}
            >
              Continue with OTP
            </button>
          </div>

          <p className="vidya-auth__footer">
            New here? <Link to="/register">Create your account →</Link>
          </p>
        </form>
      </main>
    </div>
  );
}

/* ── Shared rail (left panel) ──────────────────────────────────
   Kept inline-per-page so each auth screen can vary the quote
   without prop-drilling through a wrapper. */
export function VidyaAuthRail() {
  return (
    <aside className="vidya-auth__rail" aria-hidden>
      <div>
        <div className="vidya-auth__wordmark">
          v<em>⌑</em>dya
        </div>
        <div className="vidya-auth__wordmark-sub">The Adaptive Tutor</div>
      </div>

      <div>
        <p className="vidya-auth__quote">
          “It found my gaps in three days. My coaching couldn't in three years.”
        </p>
        <div className="vidya-auth__attrib">
          <div className="vidya-auth__attrib-avatar">KR</div>
          <div>
            <div className="vidya-auth__attrib-name">Karthik Reddy</div>
            <div className="vidya-auth__attrib-meta">NEET AIR 217 · 2026</div>
          </div>
        </div>
      </div>

      <div className="vidya-auth__footnote">
        2.4M aspirants · NEET · JEE · UPSC · GATE · CAT
      </div>
    </aside>
  );
}

/* Single-purpose inline glyph — keeps the auth bundle free of an
   icon-library dep. Colors are baked because Google's brand guidance
   forbids re-tinting these. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        d="M21.6 12.227c0-.71-.064-1.391-.184-2.045H12v3.868h5.382a4.603 4.603 0 0 1-1.995 3.018v2.51h3.228c1.886-1.74 2.985-4.302 2.985-7.351z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.964-.895 6.615-2.422l-3.228-2.51c-.895.6-2.04.954-3.387.954-2.605 0-4.81-1.76-5.598-4.123H3.064v2.59A9.997 9.997 0 0 0 12 22z"
        fill="#34A853"
      />
      <path
        d="M6.402 13.9a6.013 6.013 0 0 1 0-3.798V7.51H3.064a9.997 9.997 0 0 0 0 8.978l3.338-2.587z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.98c1.47 0 2.787.505 3.825 1.498l2.868-2.868C16.96 3.005 14.696 2 12 2 8.097 2 4.724 4.243 3.064 7.51l3.338 2.59C7.19 7.74 9.395 5.98 12 5.98z"
        fill="#EA4335"
      />
    </svg>
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
