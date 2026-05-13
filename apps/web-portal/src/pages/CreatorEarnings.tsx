// Creator earnings dashboard — production-grade redesign (2026-05-11).
//
// Layout: pg-shell → pg-header → period filter → pg-stat-strip with the
// 3 headline numbers (Total net, Courses net, Tutor sessions net) →
// detail cards split 2-up using pg-section. Replaces a 800px-wide
// centered column with a stretched full-width layout consistent with
// the rest of the portal.

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Earnings</h1>
            <p className="pg-header-sub">
              Net revenue after platform commission. Per ADR-0007, the
              commission is 15% by default; per-tutor and per-creator
              overrides apply automatically. Payouts run weekly via
              Stripe Connect.
            </p>
          </div>
          <div className="pg-header-actions">
            <select
              className="pg-filter-select"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
              ))}
            </select>
            <Link to="/creator/courses" className="pg-btn pg-btn-ghost">
              ← My courses
            </Link>
          </div>
        </header>

        {error && <p className="banner banner-error">{error}</p>}

        {earnings === null && !error && (
          <div className="pg-stat-strip">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pg-stat" style={{ opacity: 0.5 }} aria-hidden>
                <div className="pg-stat-label">Loading…</div>
                <div className="pg-stat-value">—</div>
              </div>
            ))}
          </div>
        )}

        {earnings && (
          <>
            {/* Headline KPIs */}
            <div className="pg-stat-strip">
              <div
                className="pg-stat"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(16,196,122,0.10), rgba(16,196,122,0.02))",
                  border: "1px solid rgba(16,196,122,0.30)",
                }}
              >
                <div className="pg-stat-label">Total net</div>
                <div
                  className="pg-stat-value"
                  style={{ color: "var(--color-green)" }}
                >
                  {paiseToRupees(earnings.totalNetPaise)}
                </div>
                <div className="pg-stat-delta">
                  {fmtDate(earnings.periodStart)} → {fmtDate(earnings.periodEnd)}
                </div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Courses net</div>
                <div
                  className="pg-stat-value"
                  style={{ color: "var(--color-blue)" }}
                >
                  {paiseToRupees(earnings.courseNetPaise)}
                </div>
                <div className="pg-stat-delta">
                  {earnings.courseCount} purchase
                  {earnings.courseCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="pg-stat">
                <div className="pg-stat-label">Tutor sessions net</div>
                <div
                  className="pg-stat-value"
                  style={{ color: "var(--color-purple)" }}
                >
                  {paiseToRupees(earnings.sessionNetPaise)}
                </div>
                <div className="pg-stat-delta">
                  {earnings.sessionCount} session
                  {earnings.sessionCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            {/* Detail breakdown */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: 16,
              }}
            >
              <section className="pg-section" style={{ marginBottom: 0 }}>
                <h2 className="pg-section-title">
                  Courses
                  <span className="pg-section-title-sub">
                    {earnings.courseCount} purchase
                    {earnings.courseCount === 1 ? "" : "s"}
                  </span>
                </h2>
                <div className="pg-fields">
                  <div>
                    <div className="pg-field-label">Gross revenue</div>
                    <div className="pg-field-value">
                      {paiseToRupees(earnings.courseRevenuePaise)}
                    </div>
                  </div>
                  <div>
                    <div className="pg-field-label">Platform commission</div>
                    <div className="pg-field-value" style={{ color: "var(--color-red)" }}>
                      − {paiseToRupees(earnings.courseCommissionPaise)}
                    </div>
                  </div>
                  <div>
                    <div className="pg-field-label">Net to you</div>
                    <div
                      className="pg-field-value"
                      style={{ color: "var(--color-green)", fontWeight: 700 }}
                    >
                      {paiseToRupees(earnings.courseNetPaise)}
                    </div>
                  </div>
                </div>
              </section>

              <section className="pg-section" style={{ marginBottom: 0 }}>
                <h2 className="pg-section-title">
                  Tutor sessions
                  <span className="pg-section-title-sub">
                    {earnings.sessionCount} session
                    {earnings.sessionCount === 1 ? "" : "s"}
                  </span>
                </h2>
                <div className="pg-fields">
                  <div>
                    <div className="pg-field-label">Gross revenue</div>
                    <div className="pg-field-value">
                      {paiseToRupees(earnings.sessionRevenuePaise)}
                    </div>
                  </div>
                  <div>
                    <div className="pg-field-label">Platform commission</div>
                    <div className="pg-field-value" style={{ color: "var(--color-red)" }}>
                      − {paiseToRupees(earnings.sessionCommissionPaise)}
                    </div>
                  </div>
                  <div>
                    <div className="pg-field-label">Net to you</div>
                    <div
                      className="pg-field-value"
                      style={{ color: "var(--color-green)", fontWeight: 700 }}
                    >
                      {paiseToRupees(earnings.sessionNetPaise)}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
