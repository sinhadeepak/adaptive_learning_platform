// OpenSearch 2.x domain inside the VPC.

resource "aws_security_group" "opensearch" {
  name        = "${var.project}-${var.env}-opensearch"
  description = "OpenSearch — ingress from EKS node SG only"
  vpc_id      = var.vpc_id
}

resource "aws_security_group_rule" "opensearch_from_eks" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.opensearch.id
  source_security_group_id = var.eks_node_security_group_id
}

resource "aws_opensearch_domain" "this" {
  domain_name    = "${var.project}-${var.env}"
  engine_version = var.opensearch_version

  cluster_config {
    instance_type          = var.instance_type
    instance_count         = var.instance_count
    zone_awareness_enabled = true
    zone_awareness_config { availability_zone_count = 3 }
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = 100
  }

  vpc_options {
    subnet_ids         = slice(var.subnet_ids, 0, 3)
    security_group_ids = [aws_security_group.opensearch.id]
  }

  encrypt_at_rest { enabled = true }
  node_to_node_encryption { enabled = true }
  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  // TODO: fine-grained access control with IAM role mapping in Sprint 0 Week 2.

  log_publishing_options {
    log_type                 = "INDEX_SLOW_LOGS"
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch.arn
  }

  tags = { Component = "opensearch" }
}

resource "aws_cloudwatch_log_group" "opensearch" {
  name              = "/aws/opensearch/${var.project}-${var.env}"
  retention_in_days = 30
}
