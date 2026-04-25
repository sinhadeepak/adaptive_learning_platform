import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Input, tokens } from "@alp/design-system";
import { auth } from "../lib/api";

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
      // Auth's contract is enumeration-safe (always 204) so a real failure
      // here is a network/server error worth surfacing.
      setError("We couldn't send the reset link. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Check your inbox</h1>
          <p style={styles.body}>
            If an account exists for <strong>{email}</strong>, we've sent a password-reset link.
            The link is valid for 30 minutes.
          </p>
          <p style={styles.hint}>
            Didn't get one? Check your spam folder, or{" "}
            <button type="button" onClick={() => setSubmitted(false)} style={styles.linkButton}>
              try a different email
            </button>
            .
          </p>
          <div style={styles.footer}>
            <Link to="/login" style={styles.link}>← Back to log in</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Forgot your password?</h1>
        <p style={styles.subtitle}>
          Enter the email you signed up with and we'll send you a reset link.
        </p>

        {error ? (
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={styles.form} aria-label="Forgot password">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" size="lg" isLoading={submitting} style={{ width: "100%" }}>
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <div style={styles.footer}>
          <Link to="/login" style={styles.link}>← Back to log in</Link>
        </div>
      </div>
    </main>
  );
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
    marginTop: tokens.spacing[3],
    color: tokens.colors.text.primary,
    fontSize: tokens.typography.scale.body.size,
    lineHeight: 1.5,
  },
  hint: {
    marginTop: tokens.spacing[3],
    color: tokens.colors.text.muted,
    fontSize: tokens.typography.scale.hint.size,
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
  linkButton: {
    background: "none",
    border: "none",
    color: tokens.colors.brand.primary,
    cursor: "pointer",
    fontSize: "inherit",
    padding: 0,
    textDecoration: "underline",
  },
};
