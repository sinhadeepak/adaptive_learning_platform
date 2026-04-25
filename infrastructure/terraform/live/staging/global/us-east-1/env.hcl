// CloudFront + CLOUDFRONT-scope WAF must live in us-east-1.
locals {
  env        = "staging"
  region     = "us-east-1"
  account_id = "REPLACE_WITH_STAGING_ACCOUNT_ID"
}
