import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Badge, Button, Input, tokens } from "@alp/design-system";
import { AuthError } from "@alp/auth-client";
import { useAuth } from "../lib/auth-provider";

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

  // If /login?reason=expired, surface a banner once.
  const [sessionExpired] = useState(() => new URLSearchParams(location.search).get("reason") === "expired");

  useEffect(() => {
    if (sessionExpired) setError("Your session expired. Please log in again.");
  }, [sessionExpired]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await login(email, password, remember);
      const returnTo = (location.state as LocationState | null)?.returnTo ?? sessionStorage.getItem("alp.auth.returnTo") ?? "/home";
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
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Log in</h1>
        <p style={styles.subtitle}>Welcome back, learner.</p>

        {error ? (
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={styles.form} aria-label="Log in">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />

          <div style={styles.row}>
            <label style={styles.checkboxRow}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span style={{ color: tokens.colors.text.secondary }}>Remember me</span>
            </label>
            <Link to="/forgot-password" style={styles.link}>Forgot?</Link>
          </div>

          <Button type="submit" size="lg" isLoading={submitting} style={{ width: "100%" }}>
            {submitting ? "Logging in…" : "Log in"}
          </Button>
        </form>

        <div style={styles.footer}>
          <span style={{ color: tokens.colors.text.secondary }}>New here?</span>{" "}
          <Link to="/register" style={styles.link}>Sign up</Link>
        </div>
      </div>
    </main>
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacing[4],
    background: tokens.colors.surface.secondary,
    fontFamily: tokens.typography.family.ui,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    background: tokens.colors.surface.primary,
    borderRadius: tokens.radius.card,
    border: `1px solid ${tokens.colors.border.default}`,
    padding: tokens.spacing[6],
  },
  title: {
    margin: 0,
    fontSize: tokens.typography.scale.pageTitle.size,
    fontWeight: tokens.typography.scale.pageTitle.weight,
    color: tokens.colors.text.primary,
  },
  subtitle: {
    marginTop: tokens.spacing[2],
    marginBottom: tokens.spacing[5],
    color: tokens.colors.text.secondary,
    fontSize: tokens.typography.scale.body.size,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacing[4],
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[2],
    fontSize: tokens.typography.scale.body.size,
  },
  link: {
    color: tokens.colors.brand.primary,
    textDecoration: "none",
    fontSize: tokens.typography.scale.body.size,
    fontWeight: 500,
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    background: tokens.colors.semantic.danger.bg,
    color: tokens.colors.semantic.danger.fg,
    marginBottom: tokens.spacing[4],
    fontSize: tokens.typography.scale.body.size,
  },
  footer: {
    marginTop: tokens.spacing[5],
    textAlign: "center",
    fontSize: tokens.typography.scale.body.size,
  },
};
