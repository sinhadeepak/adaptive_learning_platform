# ArgoCD — GitOps for EKS

ArgoCD is the single deploy path for everything that runs on EKS: platform
add-ons (cert-manager, external-dns, observability), infrastructure pieces
that run in-cluster (NATS), and application services.

## Two-cluster model

| Cluster | ArgoCD auto-sync | Manual promotion step |
|---|---|---|
| `alp-staging` | **on** | none — every PR merge deploys |
| `alp-prod` | **off** (per [GAP-17 v1.2](../../docs/06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx)) | DevOps Lead reviews diff → clicks Sync |

## Layout

```
infrastructure/argocd/
├── README.md
├── bootstrap/                  # One-time install per cluster
│   ├── argocd-install.yaml       # Pointer to upstream Helm chart + overrides
│   └── root-app.yaml             # App-of-Apps: installs everything under applications/
└── applications/
    ├── platform/               # Cluster-wide addons
    │   ├── cert-manager.yaml
    │   ├── external-dns.yaml
    │   ├── aws-load-balancer-controller.yaml
    │   ├── karpenter.yaml
    │   ├── nats.yaml
    │   └── observability.yaml    # ApplicationSet for Prom + Grafana + Loki + Tempo
    └── services/               # ApplicationSet fans one Application per service
        └── services.yaml
```

## Bootstrap flow

1. EKS cluster exists (Terraform).
2. Install ArgoCD via Helm (see [bootstrap/argocd-install.yaml](bootstrap/argocd-install.yaml)).
3. Apply [bootstrap/root-app.yaml](bootstrap/root-app.yaml) — this is the "root" Application that points at this repo's `infrastructure/argocd/applications/` path; everything else syncs from there.

## Sync policy

| Target | staging | prod |
|---|---|---|
| Platform addons | `automated` + `prune: true` + `selfHeal: true` | **manual** |
| Services | `automated` + `prune: true` | **manual** |
| Any `*.yaml` that creates CRDs (cert-manager, external-dns, Karpenter) | `CreateNamespace=true` + `ServerSideApply=true` | same |

The `app-of-apps` at the root is **manual** on prod so a mis-authored root
manifest cannot cascade.
