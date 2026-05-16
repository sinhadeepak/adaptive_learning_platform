import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { Banner } from "../components/dashboard";
import "@alp/design-system/shell.css";

const RESEND_COOLDOWN_S = 60;

export function Verify() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setUser } = useAuth();

  const userId = params.get("userId") ?? "";
  const email = params.get("email") ?? "";
  const channel = (params.get("kind") as "email" | "sms") ?? "email";

  const [digits, setDigits] = useState<string[]>(() => Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendCooldown]);

  if (!userId) {
    return (
      <div className="auth-page">
        <main className="auth-card">
          <Banner tone="danger" role="alert">
            Missing verification context.
          </Banner>
          <p className="auth-footer">
            <Link to="/register" className="auth-link">
              Start over
            </Link>
          </p>
        </main>
      </div>
    );
  }

  function setDigit(index: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < 5) inputs.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && digits[index] === "" && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
    if (e.key === "Enter") submit();
  }

  function onPaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6 - index);
    if (!text) return;
    e.preventDefault();
    const next = [...digits];
    for (let i = 0; i < text.length; i++) next[index + i] = text[i] ?? "";
    setDigits(next);
    const lastFilled = Math.min(5, index + text.length - 1);
    inputs.current[Math.min(5, lastFilled + 1)]?.focus();
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Enter all 6 digits.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const session = await auth.verifyOtp(userId, code, channel);
      setUser(session.user);
      navigate(
        session.user.onboardingState === "ONBOARDED" ? "/home" : "/onboarding/exam",
        { replace: true },
      );
    } catch (err) {
      setError(friendlyVerifyError(err));
      setDigits(Array(6).fill(""));
      inputs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (resendCooldown > 0) return;
    try {
      await auth.fetch("/api/v1/auth/otp/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, channel }),
      });
      setResendCooldown(RESEND_COOLDOWN_S);
    } catch {
      setError("Could not resend the code. Try again in a moment.");
    }
  }

  return (
    <div className="auth-page">
      <main className="auth-card">
        <Link to="/register" className="auth-back" aria-label="Back">
          ‹ Back
        </Link>

        <h1 className="page-greeting" style={{ marginBottom: "var(--sp-1)" }}>
          Verify your email
        </h1>
        <p className="page-subhead">
          We sent a 6-digit code to <strong>{email || "your email"}</strong>.{" "}
          <Link to="/register" className="auth-link">
            Change
          </Link>
        </p>

        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}

        <form onSubmit={submit} className="auth-form" aria-label="Verify">
          <div className="otp-cells">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={d}
                aria-label={`Digit ${i + 1} of 6`}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={1}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={(e) => onPaste(i, e)}
                className="otp-cell"
              />
            ))}
          </div>

          <p style={{ fontSize: 13, textAlign: "center", color: "var(--ink-2)", margin: 0 }}>
            Didn't get it?{" "}
            {resendCooldown > 0 ? (
              <span style={{ color: "var(--ink-3)" }}>Resend in {resendCooldown}s</span>
            ) : (
              <button type="button" onClick={resend} className="auth-link-button">
                Resend
              </button>
            )}
          </p>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
          >
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </form>
      </main>
    </div>
  );
}

function friendlyVerifyError(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 410) return "This code has expired. Send a new one.";
    if (status === 400) return "Incorrect code — try again.";
  }
  return "We couldn't verify the code. Try again.";
}