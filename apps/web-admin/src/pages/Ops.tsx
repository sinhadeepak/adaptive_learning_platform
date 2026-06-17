// Local Ops dashboard — live health of every container in the dev stack.
// Hits GET /admin/ops/infra (a learning-service rollup that probes
// each backend service's /health, NATS, OpenSearch, Redis, Postgres).
// Production observability (Prometheus / Sentry / PagerDuty) lands
// with the AWS staging cluster — see HLD §16.1.

import { useEffect, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import {
  Banner,
  MetricRows,
  SectionHeader,
  ServiceCard,
  StatCard,
  StatusDot,
  StatusPill,
  type StatusTone,
} from "../components/primitives";
import { opsAdmin, type OpsInfraComponent, type OpsInfraResponse } from "../lib/api";

const REFRESH_MS = 5000;

function statusTone(status: OpsInfraComponent["status"]): StatusTone {
  if (status === "ok") return "success";
  if (status === "degraded") return "warning";
  return "danger";
}

function ComponentCard({ c }: { c: OpsInfraComponent }) {
  const tone = statusTone(c.status);
  return (
    <ServiceCard
      name={c.name}
      tone={tone}
      badge={<StatusPill tone={tone}>{c.status.toUpperCase()}</StatusPill>}
      detail={c.detail}
    >
      <MetricRows metrics={c.metric} />
    </ServiceCard>
  );
}

export function Ops() {
  const [data, setData] = useState<OpsInfraResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setData(await opsAdmin.infra());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const services = data?.components.filter((c) => c.kind === "service") ?? [];
  const infra = data?.components.filter((c) => c.kind === "infra") ?? [];
  const downCount = data?.components.filter((c) => c.status === "down").length ?? 0;
  const degradedCount =
    data?.components.filter((c) => c.status === "degraded").length ?? 0;
  const healthyCount = (data?.components.length ?? 0) - downCount - degradedCount;

  // Overall stack health → drives the topbar chip.
  const overallTone: StatusTone =
    downCount > 0 ? "danger" : degradedCount > 0 ? "warning" : "success";
  const overallLabel =
    downCount > 0
      ? `${downCount} down`
      : degradedCount > 0
        ? `${degradedCount} degraded`
        : "All systems operational";

  return (
    <AdminShell
      crumbs="Ops dashboard · local stack"
      title="Ops dashboard"
      chips={
        <>
          {data && (
            <span className="chip-status">
              <StatusDot tone={overallTone} live={overallTone === "success"} />
              {overallLabel}
            </span>
          )}
          <span className="vidya-shell__chip">Local stack</span>
        </>
      }
    >
      <p className="dash-lede">
        Live health of every container in the dev stack. Auto-refreshes every{" "}
        {REFRESH_MS / 1000}s. Production observability (Prometheus, Sentry,
        PagerDuty) lands with the AWS staging cluster — see HLD §16.1.
      </p>

      {error && <Banner tone="danger">{error}</Banner>}

      {!data && loading && <p className="dash-lede">Probing the stack…</p>}

      {data && (
        <div className="stat-grid">
          <StatCard label="Components" value={data.components.length} />
          <StatCard label="Healthy" value={healthyCount} tone="success" />
          <StatCard
            label="Degraded"
            value={degradedCount}
            tone={degradedCount > 0 ? "warning" : "muted"}
          />
          <StatCard
            label="Down"
            value={downCount}
            tone={downCount > 0 ? "danger" : "muted"}
          />
          <StatCard
            label="Last check"
            value={new Date(data.checkedAt).toLocaleTimeString()}
            mono
          />
        </div>
      )}

      {data && services.length > 0 && (
        <section className="dash-section">
          <SectionHeader label="Backend services" count={services.length} />
          <div className="svc-grid">
            {services.map((c) => (
              <ComponentCard key={c.name} c={c} />
            ))}
          </div>
        </section>
      )}

      {data && infra.length > 0 && (
        <section className="dash-section">
          <SectionHeader label="Infrastructure" count={infra.length} />
          <div className="svc-grid">
            {infra.map((c) => (
              <ComponentCard key={c.name} c={c} />
            ))}
          </div>
        </section>
      )}
    </AdminShell>
  );
}
