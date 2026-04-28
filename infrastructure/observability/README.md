# Observability — LGTM stack on EKS

**L**oki (logs) + **G**rafana (dashboards) + **T**empo (traces) + **M**imir
(via kube-prometheus-stack's Prometheus in Phase 1; Mimir deferred to Phase 2).

Deployed via ArgoCD from [../argocd/applications/platform/observability.yaml](../argocd/applications/platform/observability.yaml).

## Helm values files

| File | Purpose |
|---|---|
| [kube-prometheus-stack.values.yaml](kube-prometheus-stack.values.yaml) | Prometheus (operator + CRDs), Alertmanager, Grafana |
| [loki.values.yaml](loki.values.yaml) | Loki in SimpleScalable mode, S3 backend |
| [promtail.values.yaml](promtail.values.yaml) | Log shipper DaemonSet |
| [tempo.values.yaml](tempo.values.yaml) | Tempo single-binary, S3 backend |

## Dashboard scaffold

Service dashboards are auto-generated from a template (see
[dashboards/service-template.json](dashboards/service-template.json)) and
sideloaded via a ConfigMap sync. Each service owner adds RED-method panels
as they instrument their service.

## Alert routing

Alertmanager → PagerDuty (oncall) + Slack (#alp-alerts).
PagerDuty service keys stored in `alertmanager-secret` (Secrets Manager →
External Secrets → K8s Secret).

## GAP-25 connection

Every service emits a `service.startup` log event with flag decisions (once
GAP-07 is resolved). Loki labels: `service`, `env`, `version`, `flag.decision`.
High-cardinality `flag.decision` is kept outside Loki labels to avoid
series explosion; it lives in the log body.
