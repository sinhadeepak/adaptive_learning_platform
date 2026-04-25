import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Input, tokens } from "@alp/design-system";
import { auth } from "../lib/api";

interface ApiProblem {
  code?: string;
  message?: string;
}

export function Register() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [tos, setTos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const canSubmit =
    firstName.length >= 1 &&
    lastName.length >= 1 &&
    email.includes("@") &&
    password.length >= 12 &&
    tos &&
    !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await auth.register({
        firstName,
        lastName,
        email,
        password,
        phone: phone || undefined,
        locale: "en-IN",
      });
      const params = new URLSearchParams({
        userId: result.userId,
        email,
        kind: "email",
      });
      navigate(`/verify?${params.toString()}`, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Create account</h1>

        {error ? (
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={styles.form} aria-label="Create account">
          <div style={styles.row2}>
            <Input
              label="First name"
              value={firstName}
              required
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              label="Last name"
              value={lastName}
              required
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            label="Phone (optional — for SMS OTP)"
            type="tel"
            value={phone}
            placeholder="+91 ..."
            onChange={(e) => setPhone(e.target.value)}
          />

          <div>
            <Input
              label="Password (min 12 characters)"
              type="password"
              autoComplete="new-password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              hint={password ? undefined : "At least 12 characters"}
              error={password && password.length < 12 ? "Too short" : undefined}
            />
            {password ? <StrengthMeter score={strength.score} label={strength.label} /> : null}
          </div>

          <label style={styles.checkboxRow}>
            <input type="checkbox" checked={tos} onChange={(e) => setTos(e.target.checked)} required />
            <span style={{ color: tokens.colors.text.secondary, fontSize: tokens.typography.scale.body.size }}>
              I agree to the <a href="/terms" style={styles.link}>Terms</a> and <a href="/privacy" style={styles.link}>Privacy</a>.
            </span>
          </label>

          <Button type="submit" size="lg" isLoading={submitting} disabled={!canSubmit} style={{ width: "100%" }}>
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <div style={styles.footer}>
          <span style={{ color: tokens.colors.text.secondary }}>Have an account?</span>{" "}
          <Link to="/login" style={styles.link}>Log in</Link>
        </div>
      </div>
    </main>
  );
}

interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Weak" | "OK" | "Strong" | "Excellent";
}

function passwordStrength(pw: string): StrengthResult {
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) && /\d/.test(pw)) score++;
  const clamped = Math.min(score, 4) as StrengthResult["score"];
  const label: StrengthResult["label"] =
    clamped <= 1 ? "Weak" : clamped === 2 ? "OK" : clamped === 3 ? "Strong" : "Excellent";
  return { score: clamped, label };
}

function StrengthMeter({ score, label }: StrengthResult) {
  const segmentColor = (i: number): string => {
    if (i >= score) return tokens.colors.surface.tertiary;
    if (score <= 1) return tokens.colors.semantic.danger.fg;
    if (score === 2) return tokens.colors.semantic.warning.fg;
    return tokens.colors.semantic.success.fg;
  };
  return (
    <div
      style={{
        display: "flex",
        gap: tokens.spacing[1],
        alignItems: "center",
        marginTop: tokens.spacing[1],
      }}
      aria-live="polite"
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 4,
            flex: 1,
            background: segmentColor(i),
            borderRadius: tokens.radius.pill,
          }}
        />
      ))}
      <span style={{ fontSize: tokens.typography.scale.hint.size, color: tokens.colors.text.muted, marginLeft: tokens.spacing[2] }}>
        {label}
      </span>
    </div>
  );
}

function friendlyError(err: unknown): string {
  // The auth-client rethrows AuthError on 409 with the body. Try to read a code if present.
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 409) return "Email is already registered. Try logging in instead.";
    if (status === 429) return "Too many sign-up attempts. Try again in a moment.";
  }
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as ApiProblem).message;
    if (msg) return msg;
  }
  return "We couldn't create your account. Please try again.";
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
    marginBottom: tokens.spacing[5],
    fontSize: tokens.typography.scale.pageTitle.size,
    fontWeight: tokens.typography.scale.pageTitle.weight,
    color: tokens.colors.text.primary,
  },
  form: { display: "flex", flexDirection: "column", gap: tokens.spacing[4] },
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.spacing[3] },
  checkboxRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacing[2],
    fontSize: tokens.typography.scale.body.size,
  },
  link: {
    color: tokens.colors.brand.primary,
    textDecoration: "none",
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
