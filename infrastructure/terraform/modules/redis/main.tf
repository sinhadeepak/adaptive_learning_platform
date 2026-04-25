// Redis 7 cluster-mode (ElastiCache).
// Shards + replicas per env.hcl.

resource "aws_security_group" "redis" {
  name        = "${var.project}-${var.env}-redis"
  description = "Redis cluster — ingress from EKS node SG only"
  vpc_id      = var.vpc_id
}

resource "aws_security_group_rule" "redis_from_eks" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = var.eks_node_security_group_id
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project}-${var.env}-redis"
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project}-${var.env}-redis"
  description          = "Redis 7 cluster for ${var.env}"

  engine                  = "redis"
  engine_version          = var.redis_engine_version
  node_type               = var.node_type
  port                    = 6379
  parameter_group_name    = "default.redis7.cluster.on"

  num_node_groups         = var.num_node_groups
  replicas_per_node_group = var.replicas

  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_update_strategy = "ROTATE"

  security_group_ids = [aws_security_group.redis.id]
  subnet_group_name  = aws_elasticache_subnet_group.redis.name

  snapshot_retention_limit = 3
  apply_immediately        = var.env != "prod"

  tags = { Component = "redis" }
}
