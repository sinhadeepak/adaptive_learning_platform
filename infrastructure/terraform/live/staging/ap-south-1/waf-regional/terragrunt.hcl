// Regional WAF — attached to ALB in-VPC. Lives in ap-south-1.
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../../modules/waf"
}

inputs = {
  scope               = "REGIONAL"
  rate_limit_per_5min = 2000
}
