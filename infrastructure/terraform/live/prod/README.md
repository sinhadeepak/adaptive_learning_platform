# prod

Prod environment — **not scaffolded yet**. Copy `staging/` here as the starting
point after Phase 1 closed-beta stabilises (~Sprint 3). Key diffs vs staging:

| Setting | Staging | Prod |
|---|---|---|
| Aurora instance count | 2 | 3+ (writer + 2 readers) |
| Aurora instance class | db.r6g.large | db.r6g.2xlarge (review post-load-test) |
| Redis shards | 2 | 4+ |
| OpenSearch | 3 × r6g.large | 3 × r6g.2xlarge (dedicated master) |
| EKS node max | 6 | 50+ (Karpenter-driven) |
| Aurora backup retention | 7 d | 30 d |
| Deletion protection | off | on |
| ArgoCD auto-sync | on | **OFF** (per GAP-17 v1.2) |
| CloudFront | PriceClass_200 | PriceClass_All |
| WAF rate limit | 2000 | 5000 regional / 10000 CloudFront |
