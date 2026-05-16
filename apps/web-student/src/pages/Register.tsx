// Register — Vidya v1 redesign (split-screen, black rail + editorial form).
//
// Spec: docs/02-design/design-system/04_components.md
//       + the 10-screen mockup set delivered with Vidya v1.
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Step indicator reads "SIGN UP · STEP 1 OF 3" — the post-create
// flow lands on /verify (step 2) and onboarding/exam (step 3).
// The mobile number prefix is fixed to +91 (India launch per
// CLAUDE.md Phase 1 scope).

import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { VidyaAuthRail } from "./Login";

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
  const [showPassword, setShowPassword] = useState(false);
  const [tos, setTos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const canSubmit =
    firstName.length >= 1 &&
    lastName.length >= 1 &&
    email.includes("@") &&
    password.length >= 8 &&
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
        phone: phone ? `+91${phone.replace(/\D/g, "")}` : undefined,
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
    <div className="vidya-auth">
      <VidyaAuthRail />

      <main className="vidya-auth__panel">
        <form
          onSubmit={onSubmit}
          className="vidya-auth__form"
          aria-label="Create account"
        >
          <div className="vidya-auth__mobile-brand">
            v<em>⌑</em>dya
          </div>

          <header>
            <p className="vidya-auth__eyebrow">Sign up · Step 1 of 3</p>
            <h1 className="vidya-auth__title">
              Begin your <em>preparation</em>.
            </h1>
            <p className="vidya-auth__subtitle">
              30-second sign-up. No card needed. Choose your exam next.
            </p>
          </header>

          {error ? (
            <div className="vidya-auth__error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}

          <div className="vidya-auth__fields-row">
            <label className="vidya-auth__field">
              <span className="vidya-auth__field-label">First name</span>
              <input
                className="vidya-auth__field-input"
                value={firstName}
                required
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
            <label className="vidya-auth__field">
              <span className="vidya-auth__field-label">Last name</span>
              <input
                className="vidya-auth__field-input"
                value={lastName}
                required
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>
          </div>

          <label className="vidya-auth__field">
            <span className="vidya-auth__field-label">Email</span>
            <input
              className="vidya-auth__field-input"
              type="email"
              autoComplete="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="vidya-auth__field">
            <span className="vidya-auth__field-label">Mobile (+91)</span>
            <input
              className="vidya-auth__field-input"
              type="tel"
              inputMode="numeric"
              value={phone}
              placeholder="98••• 21430"
              maxLength={11}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label className="vidya-auth__field">
            <span className="vidya-auth__field-label">
              Password · min 8 chars
            </span>
            <input
              className="vidya-auth__field-input"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              minLength={8}
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
          {password ? (
            <StrengthMeter score={strength.score} label={strength.label} />
          ) : null}

          <label className="vidya-auth__tos">
            <input
              type="checkbox"
              checked={tos}
              onChange={(e) => setTos(e.target.checked)}
              required
            />
            <span>
              I agree to the{" "}
              <a href="/terms" target="_blank" rel="noreferrer">
                Terms of service
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noreferrer">
                Privacy policy
              </a>
              . I'm 13+.
            </span>
          </label>

          <button
            type="submit"
            className="vidya-auth__cta"
            disabled={!canSubmit}
          >
            {submitting ? "Creating account…" : "Create account →"}
          </button>

          <p className="vidya-auth__footer">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </main>
    </div>
  );
}

/* ── Password strength meter ─────────────────────────────────── */

interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Weak" | "OK" | "Strong" | "Excellent";
}

function passwordStrength(pw: string): StrengthResult {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
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
    if (score <= 1) return "var(--bad)";
    if (score === 2) return "var(--warn)";
    return "var(--good)";
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
    if (status === 409)
      return "Email is already registered. Try logging in instead.";
    if (status === 429)
      return "Too many sign-up attempts. Try again in a moment.";
  }
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as ApiProblem).message;
    if (msg) return msg;
  }
  return "We couldn't create your account. Please try again.";
}
