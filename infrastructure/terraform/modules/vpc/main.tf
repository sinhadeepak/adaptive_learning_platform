// VPC — wraps terraform-aws-modules/vpc/aws with ALP conventions.
// 3 AZs, public + private + data subnets, NAT per AZ.

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.13"

  name = "${var.project}-${var.env}"
  cidr = var.cidr

  azs             = var.azs
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets
  database_subnets = var.database_subnets

  enable_nat_gateway     = true
  single_nat_gateway     = false   // NAT per AZ for resilience
  one_nat_gateway_per_az = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  // EKS tagging so the subnets are auto-discovered by the cluster.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }

  // VPC flow logs to CloudWatch for forensic traceability.
  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true
  flow_log_max_aggregation_interval    = 60
}
