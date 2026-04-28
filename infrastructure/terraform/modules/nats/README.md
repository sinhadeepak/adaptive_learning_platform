# nats module — intentionally empty

NATS JetStream runs **on EKS via Helm**, not via a Terraform-managed AWS
resource. The operator model: Helm chart (installed by ArgoCD) owns the
StatefulSet + PVCs + services; EBS storage class + snapshot lifecycle is
managed by the `ebs-csi-driver` addon on EKS.

See [infrastructure/argocd/applications/platform/nats.yaml](../../../argocd/applications/platform/nats.yaml)
for the ArgoCD Application that installs it.

If we later need an AWS-side sibling (SQS dead-letter, S3 for stream archive)
that belongs in Terraform, the module stub lives here.
