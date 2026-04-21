// Staging-specific inputs.
locals {
  env        = "staging"
  region     = "ap-south-1"
  account_id = "REPLACE_WITH_STAGING_ACCOUNT_ID"   // set via `terragrunt run-all` after SSO

  // Capacity — small, right-sized for the ~500-user beta cohort.
  vpc_cidr              = "10.10.0.0/16"
  eks_node_min_size     = 2
  eks_node_max_size     = 6
  eks_node_instance_types = ["m6i.large"]

  aurora_instance_count = 2     // 1 writer + 1 reader (Multi-AZ)
  aurora_instance_class = "db.r6g.large"

  redis_node_type       = "cache.t4g.small"
  redis_num_node_groups = 2     // cluster mode, 2 shards
  redis_replicas        = 1

  opensearch_instance_type  = "r6g.large.search"
  opensearch_instance_count = 3

  // NATS JetStream — 3 replicas on EKS.
  nats_replicas = 3
}
