import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Input, tokens } from "@alp/design-system";
import { AuthError } from "@alp/auth-client";
import { auth } from "../lib/api";

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
      <main style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Password updated</h1>
          <p style={styles.body}>
            You can now log in with your new password. All previous sessions have been signed out.
          </p>
          <Button size="lg" onClick={() => navigate("/login", { replace: true })} style={{ width: "100%" }}>
            Go to log in
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Set a new password</h1>
        <p style={styles.subtitle}>Pick a password you haven't used here before.</p>

        {error ? (
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={styles.form} aria-label="Reset password">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            required
            minLength={12}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 12 characters."
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            required
            minLength={12}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            type="submit"
            size="lg"
            isLoading={submitting}
            disabled={!token || submitting}
            style={{ width: "100%" }}
          >
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>

        <div style={styles.footer}>
          <Link to="/login" style={styles.link}>← Back to log in</Link>
        </div>
      </div>
    </main>
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
  body: {
    marginTop: tokens.spacing[2],
    marginBottom: tokens.spacing[5],
    color: tokens.colors.text.primary,
    fontSize: tokens.typography.scale.body.size,
    lineHeight: 1.5,
  },
  form: { display: "flex", flexDirection: "column", gap: tokens.spacing[4] },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    background: tokens.colors.semantic.danger.bg,
    color: tokens.colors.semantic.danger.fg,
    marginBottom: tokens.spacing[4],
  },
  footer: {
    marginTop: tokens.spacing[5],
    textAlign: "center",
    fontSize: tokens.typography.scale.body.size,
  },
  link: {
    color: tokens.colors.brand.primary,
    textDecoration: "none",
    fontWeight: 500,
  },
};
