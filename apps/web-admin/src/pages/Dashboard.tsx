import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { flags, type FlagSummary, type FlagAuditEntry } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, BoolPill, SkeletonRows } from "../components/primitives";

// ─────────────────────────────────────────────────────────────────────────
// Platform Dashboard — landing page for the admin portal.
// Mirrors docs/ui/03_AdminPortal/01_dashboard.html scope per the README:
//   • KPIs (active flags, danger-critical count, recent audit)
//   • SLO health tiles (placeholder until ops telemetry lands)
//   • Recent audit log preview (real backend data)
//   • Quick links to flags / audit / users / institutions
//
// Data wiring:
//   • Real: flags.list() (count, danger-critical count), flags.listAudit(limit=5)
//     for recent activity panel.
//   • Synthesised (until backend lands): SLO health tiles, user/institution counts,
//     escalations queue. Each is rendered as an empty-state with a clear "Lands
//     in Phase 2" caption.
// ─────────────────────────────────────────────────────────────────────────

interface SloTile {
  name: string;
  value: string;
  status: "met" | "warning" | "breach" | "unknown";
  caption: string;
}

const SLO_TILES: SloTile[] = [
  { name: "API availability", value: "—", status: "unknown", caption: "target 99.9% · ops telemetry lands Phase 2" },
  { name: "Quiz p95 latency", value: "—", status: "unknown", caption: "target <500ms · staging only" },
  { name: "Auth p95 latency", value: "—", status: "unknown", caption: "target <200ms · staging only" },
  { name: "5xx error rate", value: "—", status: "unknown", caption: "target <0.1% · staging only" },
];

function isPlatformScope(scope: string): boolean {
  const s = scope.toUpperCase();
  return s === "GLOBAL" || s === "PLATFORM";
}

export function Dashboard() {
  const { user } = useAuth();
  const [flagList, setFlagList] = useState<FlagSummary[] | null>(null);
  const [auditList, setAuditList] = useState<FlagAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setFlagList(await flags.list());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load flags");
      }
      try {
        setAuditList(await flags.listAudit(8));
      } catch {
        /* swallow — non-critical */
      }
    })();
  }, []);

  const dangerCount = flagList?.filter((f) => f.dangerCritical).length ?? 0;
  const totalFlags = flagList?.length ?? 0;

  return (
    <AppShell
      title="Platform Dashboard"
      chips={[
        { label: "Live", live: true },
        ...(user?.role ? [{ label: user.role }] : []),
      ]}
    >
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="ai-header" aria-label="Admin overview">
        <div className="ai-header-left">
          <span className="ai-pill">◈ ADMIN PLATFORM CONTROL</span>
          <h1 className="ai-header-name">
            <span className="ai-header-name-accent">AdaptiveLearn</span>{" "}
            ops console
          </h1>
          <p className="ai-header-sub">
            All actions on this surface are logged immutably to the audit
            trail. Use the live flag-management surface to toggle features
            without a redeploy. Phase 2 ops surfaces (Tenants, Users, SLO
            telemetry) come online with the staging cluster.
          </p>
          <div className="ai-header-btns">
            <Link to="/flags" className="btn-ai">
              ◈ Manage flags
            </Link>
            <Link to="/audit" className="btn btn-ghost">
              Audit log →
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div style={{ marginTop: "var(--sp-3)" }}>
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        </div>
      ) : null}

      {/* ── KPI tiles ─────────────────────────────────────────── */}
      <section
        className="topic-stats"
        style={{ marginTop: "var(--sp-4)" }}
        aria-label="Platform KPIs"
      >
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--info)" }}>
            {flagList === null ? "…" : totalFlags}
          </div>
          <div className="topic-stat-lbl">Active flags</div>
          <div className="topic-stat-foot">
            <Link to="/flags" className="auth-link">
              Manage →
            </Link>
          </div>
        </div>
        <div className="topic-stat">
          <div
            className="topic-stat-num"
            style={{
              color: dangerCount > 0 ? "var(--bad)" : "var(--good)",
            }}
          >
            {flagList === null ? "…" : dangerCount}
          </div>
          <div className="topic-stat-lbl">Danger-critical</div>
          <div className="topic-stat-foot">
            {dangerCount > 0 ? "needs care on toggle" : "all safe"}
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--warn)" }}>
            {auditList === null ? "…" : auditList.length}
          </div>
          <div className="topic-stat-lbl">Recent audit</div>
          <div className="topic-stat-foot">
            <Link to="/audit" className="auth-link">
              View all →
            </Link>
          </div>
        </div>
        <div className="topic-stat">
          <div className="topic-stat-num" style={{ color: "var(--gold)" }}>
            —
          </div>
          <div className="topic-stat-lbl">Active users</div>
          <div className="topic-stat-foot">user-svc analytics in P2</div>
        </div>
      </section>

      {/* ── SLO health + Recent audit (2-col) ─────────────────── */}
      <div
        className="dashboard-bottom-grid"
        style={{ marginTop: "var(--sp-4)" }}
      >
        {/* SLO health tiles */}
        <div className="card">
          <div className="sec-row">
            <h2 className="section-heading">SLO health</h2>
            <span className="pill pill-muted">staging-only</span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              margin: "0 0 var(--sp-3)",
            }}
          >
            Production ops telemetry comes online with the AWS staging cluster
            (Phase 1 still-blocked item GAP-22). Targets per HLD §16.1.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {SLO_TILES.map((s) => (
              <div
                key={s.name}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--paper-2)",
                  border: "1px solid var(--rule)",
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color:
                      s.status === "met"
                        ? "var(--good)"
                        : s.status === "warning"
                          ? "var(--warn)"
                          : s.status === "breach"
                            ? "var(--bad)"
                            : "var(--ink-3)",
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--ink-2)",
                    fontWeight: 600,
                  }}
                >
                  {s.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--ink-4)",
                    marginTop: 2,
                  }}
                >
                  {s.caption}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent audit feed */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="sec-row" style={{ padding: "var(--sp-4) var(--sp-4) var(--sp-2)" }}>
            <h2 className="section-heading">Recent audit</h2>
            <Link to="/audit" className="see-all">
              All →
            </Link>
          </div>
          {auditList === null ? (
            <div style={{ padding: "var(--sp-4)" }}>
              <SkeletonRows count={4} />
            </div>
          ) : auditList.length === 0 ? (
            <div className="empty-state" style={{ margin: "var(--sp-4)" }}>
              <div className="empty-state-title">No audit entries</div>
              <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Toggle a flag default to seed the audit trail.
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Flag</th>
                  <th>Scope</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {auditList.slice(0, 8).map((a, i) => (
                  <tr key={i}>
                    <td className="meta">
                      {new Date(a.ts).toLocaleString()}
                    </td>
                    <td>
                      <Link
                        to={`/flags/${encodeURIComponent(a.flagName)}`}
                        style={{ textDecoration: "none" }}
                      >
                        <code>{a.flagName}</code>
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`scope-chip ${
                          isPlatformScope(a.scope)
                            ? "scope-chip-platform"
                            : "scope-chip-tenant"
                        }`}
                      >
                        {isPlatformScope(a.scope) ? "global" : "tenant"}
                      </span>
                    </td>
                    <td>
                      <BoolPill value={a.newValue ?? false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Quick actions strip ───────────────────────────────── */}
      <section style={{ marginTop: "var(--sp-5)" }}>
        <h2 className="section-heading">Quick actions</h2>
        <ul className="row-list">
          <li>
            <Link to="/flags" className="row-link">
              <div className="row-link-body">
                <p className="row-link-title">⚑ Feature flags</p>
                <p className="row-link-meta">
                  Toggle defaults · per-tenant overrides · NATS-broadcast
                  invalidation
                </p>
              </div>
              <span className="chevron" aria-hidden>
                ›
              </span>
            </Link>
          </li>
          <li>
            <Link to="/audit" className="row-link">
              <div className="row-link-body">
                <p className="row-link-title">📜 Audit log</p>
                <p className="row-link-meta">
                  Append-only history · platform + tenant scopes · 3-year retention
                </p>
              </div>
              <span className="chevron" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        </ul>
        <p
          style={{
            fontSize: 11,
            color: "var(--ink-3)",
            marginTop: "var(--sp-3)",
          }}
        >
          Tenants · Users · Moderation queue · Revenue dashboards land in Phase 2
          when the institution + payment surfaces wire up.
        </p>
      </section>
    </AppShell>
  );
}