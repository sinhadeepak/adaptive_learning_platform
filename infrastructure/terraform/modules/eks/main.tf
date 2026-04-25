// EKS cluster — wraps terraform-aws-modules/eks/aws.
// Uses Karpenter for node autoscaling (per infra design). A small managed
// node group hosts Karpenter itself + critical system addons.

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.28"

  cluster_name    = "${var.project}-${var.env}"
  cluster_version = var.eks_version

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  cluster_endpoint_public_access  = false
  cluster_endpoint_private_access = true

  enable_irsa = true

  cluster_addons = {
    coredns                = { most_recent = true }
    kube-proxy             = { most_recent = true }
    vpc-cni                = { most_recent = true }
    aws-ebs-csi-driver     = { most_recent = true }
  }

  // System-critical managed node group for Karpenter + cert-manager + ArgoCD.
  eks_managed_node_groups = {
    system = {
      min_size       = var.node_min_size
      max_size       = var.node_max_size
      desired_size   = var.node_min_size
      instance_types = var.node_instance_types
      capacity_type  = "ON_DEMAND"
      labels = {
        "workload" = "system"
      }
      taints = [{
        key    = "workload"
        value  = "system"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  // Control plane logging to CloudWatch.
  cluster_enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  // TODO: add `access_entries` for DevOps + Tech Lead IAM roles once SSO is live.
}
