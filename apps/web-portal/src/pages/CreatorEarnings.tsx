// Sprint 19 (P3-S4) — Creator earnings dashboard.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { type Earnings, creatorEarnings } from "../lib/api";

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

const PERIOD_OPTIONS: { label: string; days: number }[] = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 12 months", days: 365 },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function CreatorEarnings() {
  const [days, setDays] = useState(90);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    creatorEarnings
      .get({ since: isoDaysAgo(days) })
      .then(setEarnings)
      .catch((e) => setError((e as Error).message));
  }, [days]);

  return (
    <AppShell title="Earnings">
      <main className="page" style={{ padding: 24, maxWidth: 800 }}>
        <h1>Earnings</h1>
        <p>
          <Link to="/creator/courses">← Back to my courses</Link>
        </p>

        <div style={{ marginBottom: 16 }}>
          <label>
            Period:{" "}
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="banner banner-error">{error}</p>}
        {earnings === null && !error && <p>Loading…</p>}

        {earnings && (
          <>
            <section
              style={{
                padding: 24,
                background: "var(--bg-surface-1, #fff)",
                border: "1px solid var(--border-faint)",
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Total net (after platform commission)
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>
                {paiseToRupees(earnings.totalNetPaise)}
              </div>
              <small style={{ color: "var(--text-muted)" }}>
                {earnings.periodStart.slice(0, 10)} → {earnings.periodEnd.slice(0, 10)}
              </small>
            </section>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <section
                style={{
                  padding: 16,
                  border: "1px solid var(--border-faint)",
                  borderRadius: 8,
                }}
              >
                <h3>Courses</h3>
                <p>
                  <strong>{paiseToRupees(earnings.courseNetPaise)}</strong> net
                </p>
                <small style={{ color: "var(--text-muted)" }}>
                  Gross: {paiseToRupees(earnings.courseRevenuePaise)} − commission:{" "}
                  {paiseToRupees(earnings.courseCommissionPaise)}
                </small>
                <p>{earnings.courseCount} purchase{earnings.courseCount === 1 ? "" : "s"}</p>
              </section>

              <section
                style={{
                  padding: 16,
                  border: "1px solid var(--border-faint)",
                  borderRadius: 8,
                }}
              >
                <h3>Tutor sessions</h3>
                <p>
                  <strong>{paiseToRupees(earnings.sessionNetPaise)}</strong> net
                </p>
                <small style={{ color: "var(--text-muted)" }}>
                  Gross: {paiseToRupees(earnings.sessionRevenuePaise)} − commission:{" "}
                  {paiseToRupees(earnings.sessionCommissionPaise)}
                </small>
                <p>{earnings.sessionCount} session{earnings.sessionCount === 1 ? "" : "s"}</p>
              </section>
            </div>

            <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-muted)" }}>
              Per ADR-0007, platform commission is 15% by default. Per-tutor and per-creator
              overrides apply automatically. Payouts run weekly via Stripe Connect.
            </p>
          </>
        )}
      </main>
    </AppShell>
  );
}
