import { PhaseTwoStub } from "../components/PhaseTwoStub";

export function Ops() {
  return (
    <PhaseTwoStub
      topbarTitle="Ops Dashboard"
      pillLabel="◈ PLATFORM OPS"
      heroTitle="SLO health · incidents · drills"
      heroSubtitle={
        <>
          Per the HLD §16.1 SLO list — API availability 99.9%, Quiz p95 &lt;
          500ms, Auth p95 &lt; 200ms, 5xx rate &lt; 0.1%. Production telemetry
          comes online with the AWS staging cluster (Phase 1 still-blocked
          item <code>GAP-22</code>: Aurora failover test access). The Ops
          Dashboard surfaces those gauges + active incidents + recovery
          drills.
        </>
      }
      capabilities={[
        {
          icon: "📈",
          title: "Live gauges",
          body: "API · Quiz p95 · Auth p95 · 5xx rate",
        },
        {
          icon: "🚨",
          title: "Active incidents",
          body: "PagerDuty + Sentry feed · severity tiers",
        },
        {
          icon: "🧪",
          title: "Recovery drills",
          body: "DLQ replay · backfill · rollback rehearsal",
        },
        {
          icon: "📊",
          title: "Capacity",
          body: "Aurora connections · NATS lag · OpenSearch heap",
        },
      ]}
      serviceNote="Pulls from the staging Prometheus + Sentry + PagerDuty integrations. Local Docker Compose has no observability stack wired (NATS metrics on :8222 is the closest local proxy)."
      primaryCta={{ label: "Audit log meanwhile", to: "/audit" }}
    />
  );
}
