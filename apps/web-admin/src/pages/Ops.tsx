// Local Ops dashboard — live health of every container in the dev stack.
// Hits GET /admin/ops/infra (a learning-service rollup that probes
// each backend service's /health, NATS, OpenSearch, Redis, Postgres).
// Production observability (Prometheus / Sentry / PagerDuty) lands
// with the AWS staging cluster — see HLD §16.1.

import { useEffect, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill } from "../components/primitives";
import { opsAdmin, type OpsInfraComponent, type OpsInfraResponse } from "../lib/api";

const REFRESH_MS = 5000;

function statusTone(status: OpsInfraComponent["status"]):
  | "success"
  | "warning"
  | "danger" {
  if (status === "ok") return "success";
  if (status === "degraded") return "warning";
  return "danger";
}

function MetricList({ metric }: { metric: OpsInfraComponent["metric"] }) {
  if (!metric) return null;
  const entries = Object.entries(metric);
  if (entries.length === 0) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-3)" }}>
      {entries.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "1px 0",
          }}
        >
          <span>{k}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {typeof v === "number" ? v.toLocaleString() : v}
          </span>
        </div>
      ))}
    </div>
  );
}

function ComponentCard({ c }: { c: OpsInfraComponent }) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 600, color: "var(--ink)" }}>
          {c.name}
        </div>
        <Pill tone={statusTone(c.status)}>{c.status.toUpperCase()}</Pill>
      </div>
      {c.detail && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color:
              c.status === "down"
                ? "var(--bad, #f43f5e)"
                : "var(--ink-3)",
          }}
        >
          {c.detail}
        </div>
      )}
      <MetricList metric={c.metric} />
    </div>
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
  const degradedCount = data?.components.filter((c) => c.status === "degraded").length ?? 0;

  return (
    <AdminShell
      crumbs="Ops dashboard · local stack"
      title="Ops dashboard"
      chips={<span className="vidya-shell__chip">Local stack</span>}
    >
      <div style={{ padding: "16px 24px 32px" }}>
        <p style={{ color: "var(--ink-3)", marginTop: 0 }}>
          Live health of every container in the dev stack. Auto-refreshes every{" "}
          {REFRESH_MS / 1000}s. Production observability (Prometheus, Sentry,
          PagerDuty) lands with the AWS staging cluster — see HLD §16.1.
        </p>

        {error && <Banner tone="danger">{error}</Banner>}

        {data && (
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 12,
              marginBottom: 24,
            }}
          >
            <SummaryStat label="Components" value={data.components.length} />
            <SummaryStat
              label="Healthy"
              value={data.components.length - downCount - degradedCount}
              tone="success"
            />
            <SummaryStat
              label="Degraded"
              value={degradedCount}
              tone={degradedCount > 0 ? "warning" : "muted"}
            />
            <SummaryStat
              label="Down"
              value={downCount}
              tone={downCount > 0 ? "danger" : "muted"}
            />
            <SummaryStat
              label="Last check"
              value={new Date(data.checkedAt).toLocaleTimeString()}
              tone="muted"
            />
          </div>
        )}

        {!data && loading && (
          <p style={{ color: "var(--ink-3)" }}>Loading…</p>
        )}

        {data && (
          <>
            <h3 style={{ fontSize: 14, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 8 }}>
              Backend services
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
                marginBottom: 24,
              }}
            >
              {services.map((c) => (
                <ComponentCard key={c.name} c={c} />
              ))}
            </div>

            <h3 style={{ fontSize: 14, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 8 }}>
              Infrastructure
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {infra.map((c) => (
                <ComponentCard key={c.name} c={c} />
              ))}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function SummaryStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number | string;
  tone?: "success" | "warning" | "danger" | "muted";
}) {
  const colors: Record<string, string> = {
    success: "var(--good, #10C47A)",
    warning: "var(--warn, #fbbf24)",
    danger: "var(--bad, #f43f5e)",
    muted: "var(--ink-2)",
  };
  return (
    <div
      style={{
        padding: "10px 16px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.04 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: colors[tone],
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}