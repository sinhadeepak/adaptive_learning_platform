// Global WAF — attached to CloudFront. MUST live in us-east-1.
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../../../modules/waf"
}

inputs = {
  scope               = "CLOUDFRONT"
  rate_limit_per_5min = 5000   // CloudFront edge sees more traffic; higher threshold
}
