variable "project" { type = string }
variable "env" { type = string }

variable "scope" {
  type        = string
  description = "CLOUDFRONT (must be us-east-1) or REGIONAL (ALB in ap-south-1)."
  validation {
    condition     = contains(["CLOUDFRONT", "REGIONAL"], var.scope)
    error_message = "scope must be CLOUDFRONT or REGIONAL."
  }
}

variable "rate_limit_per_5min" {
  type        = number
  default     = 2000
  description = "Rate limit (requests per 5 min per IP) before auto-block."
}

variable "managed_rule_groups" {
  type = list(object({
    name     = string
    priority = number
  }))
  default = [
    { name = "AWSManagedRulesCommonRuleSet",        priority = 1 },
    { name = "AWSManagedRulesKnownBadInputsRuleSet", priority = 2 },
    { name = "AWSManagedRulesAmazonIpReputationList", priority = 3 },
    { name = "AWSManagedRulesSQLiRuleSet",           priority = 4 },
  ]
}
