// Inputs shared across all environments.
locals {
  project = "alp"

  // Kubernetes version pinned per infrastructure design.
  eks_version = "1.29"

  // Aurora PostgreSQL engine version.
  postgres_engine_version = "15.5"

  // Redis 7 cluster-mode engine version.
  redis_engine_version = "7.1"

  // OpenSearch version.
  opensearch_version = "OpenSearch_2.15"
}
