// ForgotPassword — Vidya v1 redesign (split-screen, black rail + editorial form).
//
// Spec: docs/02-design/design-system/04_components.md
//       + the 10-screen mockup set delivered with Vidya v1.
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Sends a 6-digit one-time code (email or SMS depending on identifier
// shape) and routes to /verify?kind=reset for the next step.

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/api";
import { VidyaAuthRail } from "./Login";

export function ForgotPassword() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.forgotPassword(identifier);
      const params = new URLSearchParams({
        email: identifier,
        kind: "reset",
      });
      navigate(`/verify?${params.toString()}`);
    } catch {
      setError("We couldn't send the code. Try again in a moment.");
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
          aria-label="Forgot password"
        >
          <div className="vidya-auth__mobile-brand">
            v<em>⌑</em>dya
          </div>

          <header>
            <p className="vidya-auth__eyebrow">Forgot password · Step 1 of 3</p>
            <h1 className="vidya-auth__title">
              Let's get you <em>back in</em>.
            </h1>
            <p className="vidya-auth__subtitle">
              Enter the email or mobile you signed up with. We'll send a
              one-time code.
            </p>
          </header>

          {error ? (
            <div className="vidya-auth__error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}

          <label className="vidya-auth__field">
            <span className="vidya-auth__field-label">Email or mobile</span>
            <input
              className="vidya-auth__field-input"
              type="text"
              autoComplete="username"
              value={identifier}
              required
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </label>

          <button
            type="submit"
            className="vidya-auth__cta"
            disabled={submitting || identifier.length < 3}
          >
            {submitting ? "Sending…" : "Send code →"}
          </button>

          <p className="vidya-auth__footer">
            <Link to="/login">← Back to log in</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
