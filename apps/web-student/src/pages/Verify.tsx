import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, tokens } from "@alp/design-system";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";

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

  // Initial focus on first cell.
  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendCooldown]);

  if (!userId) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: tokens.colors.semantic.danger.fg }}>Missing verification context.</p>
          <Link to="/register" style={styles.link}>Start over</Link>
        </div>
      </main>
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
      navigate(session.user.onboardingState === "ONBOARDED" ? "/home" : "/onboarding/exam", { replace: true });
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
      // Auth-client doesn't expose resend yet — call the endpoint directly.
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
    <main style={styles.page}>
      <div style={styles.card}>
        <Link to="/register" style={styles.backLink} aria-label="Back">‹ Back</Link>

        <h1 style={styles.title}>Verify your email</h1>
        <p style={styles.subtitle}>
          We sent a 6-digit code to <strong>{email || "your email"}</strong>.{" "}
          <Link to="/register" style={styles.link}>Change</Link>
        </p>

        {error ? (
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={submit} style={styles.form} aria-label="Verify">
          <div style={styles.cells}>
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
                style={styles.cell}
              />
            ))}
          </div>

          <div style={styles.resendRow}>
            <span style={{ color: tokens.colors.text.secondary }}>Didn't get it?</span>{" "}
            {resendCooldown > 0 ? (
              <span style={{ color: tokens.colors.text.muted }}>Resend in {resendCooldown}s</span>
            ) : (
              <button type="button" onClick={resend} style={styles.linkButton}>Resend</button>
            )}
          </div>

          <Button type="submit" size="lg" isLoading={submitting} style={{ width: "100%" }}>
            {submitting ? "Verifying…" : "Verify"}
          </Button>
        </form>
      </div>
    </main>
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
  backLink: {
    color: tokens.colors.text.secondary,
    textDecoration: "none",
    fontSize: tokens.typography.scale.body.size,
  },
  title: {
    margin: 0,
    marginTop: tokens.spacing[3],
    fontSize: tokens.typography.scale.pageTitle.size,
    fontWeight: tokens.typography.scale.pageTitle.weight,
    color: tokens.colors.text.primary,
  },
  subtitle: {
    color: tokens.colors.text.secondary,
    marginTop: tokens.spacing[2],
    marginBottom: tokens.spacing[5],
    fontSize: tokens.typography.scale.body.size,
  },
  form: { display: "flex", flexDirection: "column", gap: tokens.spacing[4] },
  cells: { display: "flex", justifyContent: "space-between", gap: tokens.spacing[2] },
  cell: {
    width: 48,
    height: 56,
    fontSize: 24,
    textAlign: "center",
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.input,
    fontFamily: tokens.typography.family.mono,
    color: tokens.colors.text.primary,
    background: tokens.colors.surface.primary,
    outline: "none",
  },
  resendRow: { fontSize: tokens.typography.scale.body.size, textAlign: "center" },
  link: {
    color: tokens.colors.brand.primary,
    textDecoration: "none",
    fontWeight: 500,
  },
  linkButton: {
    background: "none",
    border: "none",
    padding: 0,
    color: tokens.colors.brand.primary,
    fontWeight: 500,
    cursor: "pointer",
    fontSize: tokens.typography.scale.body.size,
    fontFamily: "inherit",
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
};
