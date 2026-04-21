// Root Terragrunt config — every child terragrunt.hcl `include`s this.
// Owns: remote state backend, provider generation, shared input defaults.

locals {
  common_vars  = read_terragrunt_config(find_in_parent_folders("common.hcl"))
  env_vars     = read_terragrunt_config(find_in_parent_folders("env.hcl"))

  account_id   = local.env_vars.locals.account_id
  region       = local.env_vars.locals.region
  env          = local.env_vars.locals.env
}

// --- Remote state (S3 + DynamoDB lock) -----------------------------------

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket         = "alp-tf-state-${local.env}"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = local.region
    encrypt        = true
    dynamodb_table = "alp-tf-locks-${local.env}"

    // Bucket + table must be created out-of-band before first `terragrunt run-all init`.
    // See infrastructure/terraform/README.md § Prerequisites.
  }
}

// --- Provider generation --------------------------------------------------

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  required_version = "~> 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = "${local.region}"
  allowed_account_ids = ["${local.account_id}"]

  default_tags {
    tags = {
      Project     = "adaptive-learning-platform"
      Environment = "${local.env}"
      ManagedBy   = "terragrunt"
      Owner       = "devops-lead"
    }
  }
}
EOF
}

// --- Shared inputs --------------------------------------------------------

inputs = merge(
  local.common_vars.locals,
  local.env_vars.locals,
)
