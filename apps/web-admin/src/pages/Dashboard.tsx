// Dashboard — Vidya v1 admin "AdaptiveLearn ops console" (mockup 1/29).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 admin mockup 1/29.
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout:
//   topbar: PLATFORM DASHBOARD crumb + "AdaptiveLearn ops console" /
//           Live + PLATFORM_ADMIN chips
//   ┌─ admin hero card: ⊕ ADMIN PLATFORM CONTROL eyebrow +
//   │   Instrument-Serif title + body + Manage flags / Audit log CTAs
//   ┌─ 4 KPI tiles: Active flags / Danger-critical / Recent audit /
//   │  Active users
//   ┌─ 2-col: SLO health + Recent audit
//
// Data: flags.list() + flags.listAudit(limit=N) — same hooks as the
// Aurora version; only the JSX swaps.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { flags, type FlagSummary, type FlagAuditEntry } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AdminShell } from "../components/AdminShell";

interface SloTile {
  key: string;
  name: string;
  value: string;
  caption: string;
}

const SLO_TILES: SloTile[] = [
  { key: "api",   name: "API availability", value: "—", caption: "target 99.9% · ops telemetry lands Phase 2" },
  { key: "quiz",  name: "Quiz p95 latency", value: "—", caption: "target <500ms · staging only" },
  { key: "auth",  name: "Auth p95 latency", value: "—", caption: "target <200ms · staging only" },
  { key: "5xx",   name: "5xx error rate",   value: "—", caption: "target <0.1% · staging only" },
];

export function Dashboard() {
  const { user } = useAuth();
  const [flagList, setFlagList] = useState<FlagSummary[] | null>(null);
  const [auditList, setAuditList] = useState<FlagAuditEntry[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setFlagList(await flags.list());
      } catch { /* surface inline via state below */ }
      try {
        setAuditList(await flags.listAudit(8));
      } catch { /* non-critical */ }
    })();
  }, []);

  const totalFlags = flagList?.length ?? 0;
  const dangerCount = flagList?.filter((f) => f.dangerCritical).length ?? 0;
  const recentAudit = auditList?.length ?? 0;

  return (
    <AdminShell
      crumbs="Platform dashboard"
      title="AdaptiveLearn ops console."
      subtitle="Every action on this surface is logged immutably to the audit trail."
      chips={
        <>
          <span className="vidya-shell__chip vidya-shell__chip--on">● Live</span>
          {user?.role ? (
            <span className="vidya-shell__chip">{user.role}</span>
          ) : null}
        </>
      }
    >
      {/* ── Admin hero card ───────────────────────────────────── */}
      <section className="admin-hero">
        <p className="admin-hero__eyebrow">⊕ Admin · platform control</p>
        <h2 className="admin-hero__headline">
          AdaptiveLearn ops console
        </h2>
        <p className="admin-hero__body">
          All actions on this surface are logged immutably to the audit
          trail. Use the live flag-management surface to toggle features
          without a redeploy. Phase 2 ops surfaces (Tenants, Users, SLO
          telemetry) come online with the staging cluster.
        </p>
        <div className="admin-hero__cta-row">
          <Link to="/flags" className="vidya-shell__primary">
            ⚑ Manage flags
          </Link>
          <Link to="/audit" className="admin-hero__link">
            Audit log →
          </Link>
        </div>
      </section>

      {/* ── KPI tiles ─────────────────────────────────────────── */}
      <div className="vidya-grid-4">
        <KpiTile
          label="Active flags"
          value={String(totalFlags || (flagList === null ? "—" : 0))}
          delta={totalFlags > 0 ? "Manage →" : undefined}
          deltaHref="/flags"
        />
        <KpiTile
          label="Danger-critical"
          value={String(dangerCount)}
          delta="needs care on toggle"
          tone={dangerCount > 0 ? "bad" : "neutral"}
        />
        <KpiTile
          label="Recent audit"
          value={String(recentAudit)}
          delta="View all →"
          deltaHref="/audit"
        />
        <KpiTile
          label="Active users"
          value="—"
          delta="user-svc analytics in P2"
        />
      </div>

      {/* ── SLO health + Recent audit ─────────────────────────── */}
      <div className="vidya-grid-2">
        <section className="admin-card">
          <header className="admin-card__head">
            <span className="admin-card__title">SLO health</span>
            <span className="vidya-shell__chip">staging-only</span>
          </header>
          <p className="admin-card__lede">
            Production ops telemetry comes online with the AWS staging cluster
            (Phase 1 still-blocked item GAP-22). Targets per HLD §16.1.
          </p>
          <div className="admin-slo-grid">
            {SLO_TILES.map((s) => (
              <div className="admin-slo-tile" key={s.key}>
                <div className="admin-slo-tile__value">{s.value}</div>
                <div className="admin-slo-tile__name">{s.name}</div>
                <div className="admin-slo-tile__caption">{s.caption}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card">
          <header className="admin-card__head">
            <span className="admin-card__title">Recent audit</span>
            <Link to="/audit" className="admin-card__more">
              All →
            </Link>
          </header>
          {auditList === null ? (
            <p className="admin-card__lede">Loading…</p>
          ) : auditList.length === 0 ? (
            <p className="admin-card__empty">
              <strong>No audit entries</strong>
              <span>Toggle a flag default to seed the audit trail.</span>
            </p>
          ) : (
            <ul className="admin-audit-list">
              {auditList.slice(0, 6).map((row, i) => (
                <li className="admin-audit-row" key={`${row.flagName}-${row.ts}-${i}`}>
                  <span className="admin-audit-row__flag">{row.flagName}</span>
                  <span className="admin-audit-row__change">
                    {String(row.oldValue ?? "—")}
                    <span className="admin-audit-row__arrow">→</span>
                    {String(row.newValue ?? "—")}
                  </span>
                  <span className="admin-audit-row__meta">
                    {row.actorUserId ? row.actorUserId.slice(0, 8) : "system"} ·{" "}
                    {row.ts
                      ? new Date(row.ts).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  delta?: string;
  deltaHref?: string;
  tone?: "neutral" | "bad" | "good";
}

function KpiTile({ label, value, delta, deltaHref, tone = "neutral" }: KpiTileProps) {
  return (
    <section className={`admin-kpi admin-kpi--${tone}`}>
      <div className="admin-kpi__value">{value}</div>
      <div className="admin-kpi__label">{label}</div>
      {delta ? (
        deltaHref ? (
          <Link to={deltaHref} className="admin-kpi__delta">{delta}</Link>
        ) : (
          <span className="admin-kpi__delta">{delta}</span>
        )
      ) : null}
    </section>
  );
}
