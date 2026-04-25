# k8s/charts — Helm charts for ALP services

Each backend service is deployed via its own Helm chart, which delegates all
resource rendering to the shared [alp-service](alp-service/) library chart.
ArgoCD's services ApplicationSet picks these up and deploys one Application
per service.

## Layout

```
charts/
├── alp-service/            # library chart (type: library)
│   ├── Chart.yaml
│   ├── values.yaml         # defaults
│   ├── README.md
│   └── templates/
│       ├── _helpers.tpl
│       ├── _render.tpl     # aggregator: alp-service.render
│       ├── _deployment.tpl
│       ├── _service.tpl
│       ├── _serviceaccount.tpl
│       ├── _hpa.tpl
│       ├── _servicemonitor.tpl
│       └── _networkpolicy.tpl
└── <service>/              # one per service — 11 total
    ├── Chart.yaml          # dependency: alp-service
    ├── values.yaml
    ├── values-staging.yaml
    ├── values-prod.yaml    # added Sprint 3
    └── templates/
        └── all.yaml        # single line: {{ include "alp-service.render" . }}
```

## Local rendering / testing

```bash
cd infrastructure/k8s/charts
helm dependency update auth        # pulls alp-service as a file:// dep
helm template auth auth -f auth/values-staging.yaml
```

`ct lint` (chart-testing) runs in CI on PRs that touch `infrastructure/k8s/charts/`.

## Image tag strategy

- `tag` in `values.yaml` is the semantic version (e.g. `0.1.0`).
- CI overrides `image.tag` per deploy with the commit SHA: `--set image.tag=$GITHUB_SHA`.
- ArgoCD pins the tag explicitly — no `:latest`.

## What belongs in the library vs. per-service

| In library | In per-service chart |
|---|---|
| Deployment/Service/HPA/ServiceMonitor/NetworkPolicy/SA templates | `image.repository`, IRSA role ARN, envFromSecret name |
| Resource requests/limits defaults | Resource overrides when service has non-standard needs |
| Default probes + scrape config | Custom probes (e.g. gRPC health for adaptive-engine) |
| Topology spread | — |
| | Ingress (paths differ per service) |
| | KEDA ScaledObject (NATS lag; added per-service) |

## Sprint 0 scope caveat

These charts are **structurally correct** but not yet applied. The ApplicationSet
in [../argocd/applications/services/services.yaml](../../argocd/applications/services/services.yaml)
references them by path. First real apply happens in Sprint 1 after:
1. ECR repos exist (Terraform).
2. IRSA roles exist (Terraform, outputs → values-staging.yaml `eks.amazonaws.com/role-arn`).
3. ExternalSecrets operator is installed.
