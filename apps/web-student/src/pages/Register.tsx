import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    <div className="auth-page">
      <main className="auth-card">
        <div className="auth-mark">
          <div className="sidebar-mark">A</div>
          <span className="sidebar-mark-text">AdaptiveLearn</span>
        </div>
        <h1 className="page-greeting" style={{ marginBottom: "var(--sp-5)" }}>
          Create account
        </h1>

        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}

        <form onSubmit={onSubmit} className="auth-form" aria-label="Create account">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
            <label className="form-field">
              <span className="form-label">First name</span>
              <input
                value={firstName}
                required
                onChange={(e) => setFirstName(e.target.value)}
                className="form-input"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Last name</span>
              <input
                value={lastName}
                required
                onChange={(e) => setLastName(e.target.value)}
                className="form-input"
              />
            </label>
          </div>

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
            <span className="form-label">Phone (optional — for SMS OTP)</span>
            <input
              type="tel"
              value={phone}
              placeholder="+91 ..."
              onChange={(e) => setPhone(e.target.value)}
              className="form-input"
            />
          </label>

          <div>
            <label className="form-field">
              <span className="form-label">Password (min 12 characters)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </label>
            {password ? <StrengthMeter score={strength.score} label={strength.label} /> : null}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--sp-2)",
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            <input
              type="checkbox"
              checked={tos}
              onChange={(e) => setTos(e.target.checked)}
              required
            />
            <span>
              I agree to the{" "}
              <a href="/terms" className="auth-link">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="auth-link">
                Privacy
              </a>
              .
            </span>
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={!canSubmit}
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Have an account?{" "}
          <Link to="/login" className="auth-link">
            Log in
          </Link>
        </p>
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
    if (i >= score) return "var(--bg-surface3)";
    if (score <= 1) return "var(--color-red)";
    if (score === 2) return "var(--color-amber)";
    return "var(--color-green)";
  };
  return (
    <div className="strength-meter" aria-live="polite">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="strength-meter-seg"
          style={{ background: segmentColor(i) }}
        />
      ))}
      <span className="strength-meter-label">{label}</span>
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
