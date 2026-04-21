// WAFv2 web ACL — CloudFront (global) + regional (ALB).
// Global scope must be deployed in us-east-1; regional stays in ap-south-1.

resource "aws_wafv2_web_acl" "this" {
  name        = "${var.project}-${var.env}-${var.scope == "CLOUDFRONT" ? "global" : "regional"}"
  description = "ALP ${var.env} — ${var.scope}"
  scope       = var.scope

  default_action { allow {} }

  // AWS managed rule sets — common protection layer.
  dynamic "rule" {
    for_each = var.managed_rule_groups
    content {
      name     = rule.value.name
      priority = rule.value.priority
      override_action { none {} }
      statement {
        managed_rule_group_statement {
          name        = rule.value.name
          vendor_name = "AWS"
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.value.name
        sampled_requests_enabled   = true
      }
    }
  }

  // Rate-based rule — basic DDoS / scraper protection.
  rule {
    name     = "RateLimitPerIp"
    priority = 100
    action { block {} }
    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5min
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitPerIp"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-${var.env}-web-acl"
    sampled_requests_enabled   = true
  }
}
