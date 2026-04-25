// Bootstrap root — staging. Run with LOCAL backend first (see README.md),
// then migrate state to the created bucket.

terraform {
  required_version = "~> 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
    tls = { source = "hashicorp/tls", version = "~> 4.0" }
  }

  // After first apply, uncomment this block and run:
  //   terraform init -migrate-state -backend-config=...
  // backend "s3" {
  //   bucket         = "alp-tf-state-staging"
  //   key            = "bootstrap/terraform.tfstate"
  //   region         = "ap-south-1"
  //   dynamodb_table = "alp-tf-locks-staging"
  //   encrypt        = true
  // }
}

provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = {
      Project     = "adaptive-learning-platform"
      Environment = "staging"
      ManagedBy   = "terraform"
      Component   = "bootstrap"
    }
  }
}

module "state_backend" {
  source = "../modules/state-backend"
  env    = "staging"
}

module "github_oidc" {
  source = "../modules/github-oidc"
  env    = "staging"
  repo   = "sinhadeepak/adaptive_learning_platform"
}

output "next_steps" {
  value = <<EOT
---- Bootstrap complete ----
Add these as GitHub Actions secrets:
  AWS_TF_PLAN_ROLE_STAGING  = ${module.github_oidc.plan_role_arn}
  AWS_TF_APPLY_ROLE_STAGING = ${module.github_oidc.apply_role_arn}

Then migrate state to S3:
  terraform init -migrate-state \
    -backend-config="bucket=${module.state_backend.bucket_name}" \
    -backend-config="key=bootstrap/terraform.tfstate" \
    -backend-config="region=ap-south-1" \
    -backend-config="dynamodb_table=${module.state_backend.lock_table_name}" \
    -backend-config="encrypt=true"
EOT
}
