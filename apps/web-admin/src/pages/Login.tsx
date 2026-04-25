import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthError } from "@alp/auth-client";
import { useAuth } from "../lib/auth-provider";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? "/flags";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      if (err instanceof AuthError && err.code === "invalid_credentials") {
        setError("Email or password is incorrect.");
      } else if (err instanceof AuthError && err.code === "rate_limited") {
        setError("Too many attempts — wait a minute.");
      } else {
        setError("Login failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 380, margin: "5rem auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 22 }}>Admin sign-in</h1>
      <p style={{ color: "#555", fontSize: 14 }}>
        Restricted to institution and platform admins.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 24 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 8, fontSize: 14 }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 8, fontSize: 14 }}
          />
        </label>
        {error && (
          <div role="alert" style={{ color: "#a51c30", fontSize: 13 }}>
            {error}
          </div>
        )}
        <button type="submit" disabled={submitting} style={{ padding: 10, fontSize: 14 }}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
