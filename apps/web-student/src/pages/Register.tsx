// Register — Aurora redesign (split-screen).
//
// Spec: docs/02-design/design-system-v2-aurora.md §8.2.1
// ADR:  docs/adr/0028-design-system-v2-aurora.md (S8 deliverable)

import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Checkbox, FormField, Input } from "@alp/ui";
import { auth } from "../lib/api";
import { Banner } from "../components/dashboard";
import "@alp/design-system/shell.css";

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
      const params = new URLSearchParams({ userId: result.userId, email, kind: "email" });
      navigate(`/verify?${params.toString()}`, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="alp-authpage">
      <aside className="alp-authpage__illustration" aria-hidden>
        <div className="alp-authpage__brand">
          <span className="alp-authpage__brand-mark">A</span>
          AdaptiveLearn
        </div>
        <div>
          <div className="alp-authpage__tagline">
            Join the AI-coached generation.
          </div>
          <div className="alp-authpage__tagline-sub">
            Set your exam target. Take a 5-minute diagnostic. We build your plan
            from there.
          </div>
        </div>
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          ✦ Free to start · upgrade anytime
        </div>
      </aside>

      <main className="alp-authpage__panel">
        <form
          onSubmit={onSubmit}
          className="alp-authpage__form"
          aria-label="Create account"
        >
          <div className="alp-authpage__mobile-brand">
            <span className="alp-authpage__brand-mark">A</span>
            AdaptiveLearn
          </div>
          <header>
            <h1 className="alp-authpage__title">Create account</h1>
            <p className="alp-authpage__subtitle">
              Takes 30 seconds. We'll send a verification code next.
            </p>
          </header>

          {error ? (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="First name" required>
              <Input
                value={firstName}
                required
                onChange={(e) => setFirstName(e.target.value)}
              />
            </FormField>
            <FormField label="Last name" required>
              <Input
                value={lastName}
                required
                onChange={(e) => setLastName(e.target.value)}
              />
            </FormField>
          </div>

          <FormField label="Email">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>

          <FormField label="Phone (optional — for SMS OTP)">
            <Input
              type="tel"
              value={phone}
              placeholder="+91 ..."
              onChange={(e) => setPhone(e.target.value)}
            />
          </FormField>

          <FormField label="Password" required helper="At least 12 characters.">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          {password ? (
            <StrengthMeter score={strength.score} label={strength.label} />
          ) : null}

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 13,
              color: "var(--ink-2)",
            }}
          >
            <Checkbox
              checked={tos}
              onChange={(e) => setTos(e.target.checked)}
              required
            />
            <span>
              I agree to the{" "}
              <a
                href="/terms"
                style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
              >
                Terms
              </a>{" "}
              and{" "}
              <a
                href="/privacy"
                style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
              >
                Privacy
              </a>
              .
            </span>
          </label>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={!canSubmit}
          >
            {submitting ? "Creating account…" : "Create account"}
          </Button>

          <p
            style={{
              textAlign: "center",
              margin: 0,
              color: "var(--ink-3)",
              fontSize: 14,
            }}
          >
            Have an account?{" "}
            <Link
              to="/login"
              style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
            >
              Log in
            </Link>
          </p>
        </form>
      </main>
    </div>
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
    if (i >= score) return "var(--rule-2)";
    if (score <= 1) return "var(--danger-500)";
    if (score === 2) return "var(--developing-500)";
    return "var(--success-500)";
  };
  return (
    <div
      aria-live="polite"
      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 4,
            flex: 1,
            borderRadius: 2,
            background: segmentColor(i),
            transition: "background 200ms var(--m-ease)",
          }}
        />
      ))}
      <span style={{ color: "var(--ink-3)", minWidth: 56, textAlign: "right" }}>
        {label}
      </span>
    </div>
  );
}

function friendlyError(err: unknown): string {
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