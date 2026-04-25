# alp-service — common library chart

Library chart (`type: library`). Exports `define`d templates for the resources
every ALP service needs: `Deployment`, `Service`, `HPA`, `ServiceMonitor`,
`ServiceAccount` (IRSA-ready), `NetworkPolicy`.

## How a service chart uses it

```
infrastructure/k8s/charts/<service>/
├── Chart.yaml                  # declares dependency on alp-service
├── values.yaml                 # service-specific defaults
├── values-staging.yaml         # staging overrides
├── values-prod.yaml            # prod overrides (added Sprint 3)
└── templates/
    └── all.yaml                # one line: {{ include "alp-service.render" . }}
```

## What the library renders (with overrideable bits)

| Resource | Condition | Notes |
|---|---|---|
| `ServiceAccount` | `.Values.serviceAccount.create` | IRSA annotation passed through |
| `Deployment` | always | non-root, read-only root FS, seccomp RuntimeDefault, topology spread across AZs |
| `Service` | always | ClusterIP on port 8000 |
| `HorizontalPodAutoscaler` | `.Values.autoscaling.enabled` | CPU-based; KEDA (NATS lag) added per-service later |
| `ServiceMonitor` | `.Values.serviceMonitor.enabled` | discovered by kube-prometheus-stack via `release: kps` label |
| `NetworkPolicy` | `.Values.networkPolicy.enabled` | default-deny egress + selective allow (DNS, PG, Redis, NATS, OpenSearch, HTTPS) |

## Checksum-based rollout

Every values change rolls the deployment via a `checksum/config` annotation on
the pod template. No manual `kubectl rollout restart` needed.

## What is NOT here (yet)

- Cert-manager `Certificate` (tls termination at ALB; mTLS via linkerd — Sprint 3).
- PodDisruptionBudget (added Sprint 2 when we run load tests).
- ExternalSecrets `ExternalSecret` resource (added once External Secrets Operator is installed).
- Ingress — lives in the per-service chart because paths differ.
