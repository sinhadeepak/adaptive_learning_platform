// Verify — Vidya v1 redesign (OTP entry).
//
// Spec: docs/02-design/design-system/04_components.md
//       + the 10-screen mockup set delivered with Vidya v1.
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Step indicator varies by entry point:
//   • from /register → "SIGN UP · STEP 2 OF 3" (email verify)
//   • from /forgot-password → "FORGOT PASSWORD · STEP 2 OF 3"
//
// The 6 OTP boxes accept paste (any 6-digit chunk fans out across
// the cells) and auto-advance on each digit. Backspace on an empty
// cell jumps to the previous one.

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
import { VidyaAuthRail } from "./Login";

const RESEND_COOLDOWN_S = 60;

export function Verify() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setUser } = useAuth();

  const userId = params.get("userId") ?? "";
  const email = params.get("email") ?? "";
  const channel = (params.get("kind") as "email" | "sms" | "reset") ?? "email";
  const eyebrow =
    channel === "reset"
      ? "Forgot password · Step 2 of 3"
      : "Sign up · Step 2 of 3";

  const [digits, setDigits] = useState<string[]>(() => Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_S);
  const inputs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setTimeout(
      () => setResendCooldown(resendCooldown - 1),
      1000,
    );
    return () => window.clearTimeout(id);
  }, [resendCooldown]);

  if (!userId && channel !== "reset") {
    return (
      <div className="vidya-auth">
        <VidyaAuthRail />
        <main className="vidya-auth__panel">
          <div className="vidya-auth__form">
            <div className="vidya-auth__error" role="alert">
              <span>Missing verification context.</span>
            </div>
            <p className="vidya-auth__footer">
              <Link to="/register">Start over →</Link>
            </p>
          </div>
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
    const text = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6 - index);
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
      if (channel === "reset") {
        // Reset flow: code verified → ResetPassword form (step 3 of 3)
        navigate(`/reset-password?email=${encodeURIComponent(email)}&code=${code}`);
        return;
      }
      const session = await auth.verifyOtp(userId, code, channel);
      setUser(session.user);
      navigate(
        session.user.onboardingState === "ONBOARDED"
          ? "/home"
          : "/onboarding/exam",
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

  const mm = String(Math.floor(resendCooldown / 60)).padStart(2, "0");
  const ss = String(resendCooldown % 60).padStart(2, "0");

  return (
    <div className="vidya-auth">
      <VidyaAuthRail />

      <main className="vidya-auth__panel">
        <form
          onSubmit={submit}
          className="vidya-auth__form"
          aria-label="Verify code"
          style={{ alignItems: "stretch" }}
        >
          <div className="vidya-auth__mobile-brand">
            v<em>⌑</em>dya
          </div>

          <header>
            <p className="vidya-auth__eyebrow">{eyebrow}</p>
            <h1 className="vidya-auth__title">Check your inbox.</h1>
            <p className="vidya-auth__subtitle">
              We sent a 6-digit code to <strong>{email || "your email"}</strong>
              .{" "}
              <Link
                to={channel === "reset" ? "/forgot-password" : "/register"}
                style={{ color: "var(--accent)", textDecoration: "none" }}
              >
                Change {channel === "reset" ? "email" : "email"}
              </Link>
            </p>
          </header>

          {error ? (
            <div className="vidya-auth__error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}

          <div className="vidya-otp">
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
                className="vidya-otp__box"
              />
            ))}
          </div>

          <p className="vidya-otp__resend">
            {resendCooldown > 0 ? (
              <>Resend in {mm}:{ss}</>
            ) : (
              <button type="button" onClick={resend}>
                Resend code
              </button>
            )}
          </p>

          <button
            type="submit"
            className="vidya-auth__cta"
            disabled={submitting || digits.join("").length !== 6}
          >
            {submitting ? "Verifying…" : "Verify code →"}
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
