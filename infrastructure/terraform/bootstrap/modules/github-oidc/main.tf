// GitHub Actions OIDC provider + assume-role trust.
// Created once per AWS account. Two roles per env: plan (read-mostly) and apply.

data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]
}

// ---------- plan role (PRs) ----------

data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      // Allow PR workflows from any branch in the repo (plan only, low risk).
      values   = ["repo:${var.repo}:*"]
    }
  }
}

resource "aws_iam_role" "plan" {
  name               = "alp-tf-plan-${var.env}"
  assume_role_policy = data.aws_iam_policy_document.plan_trust.json
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

// ---------- apply role (merges to main) ----------

data "aws_iam_policy_document" "apply_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      // Apply is restricted to main-branch pushes only.
      values   = ["repo:${var.repo}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "apply" {
  name               = "alp-tf-apply-${var.env}"
  assume_role_policy = data.aws_iam_policy_document.apply_trust.json
}

// TODO: tighten the policy below. AdministratorAccess is placeholder for
// first bootstrap; scope down to the services we actually manage + deny
// destroy on state bucket/table. Ticket: INFRA-BOOT-1.
resource "aws_iam_role_policy_attachment" "apply_admin" {
  role       = aws_iam_role.apply.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

// Explicit deny to protect state artefacts from the apply role.
data "aws_iam_policy_document" "apply_guardrail" {
  statement {
    effect = "Deny"
    actions = [
      "s3:DeleteBucket",
      "s3:PutBucketVersioning",
      "dynamodb:DeleteTable",
    ]
    resources = [
      "arn:aws:s3:::alp-tf-state-*",
      "arn:aws:s3:::alp-tf-state-*/*",
      "arn:aws:dynamodb:*:*:table/alp-tf-locks-*",
    ]
  }
  statement {
    effect    = "Deny"
    actions   = ["iam:DeleteOpenIDConnectProvider", "iam:DeleteRole"]
    resources = [
      aws_iam_openid_connect_provider.github.arn,
      aws_iam_role.plan.arn,
      aws_iam_role.apply.arn,
    ]
  }
}

resource "aws_iam_policy" "apply_guardrail" {
  name   = "alp-tf-apply-${var.env}-guardrail"
  policy = data.aws_iam_policy_document.apply_guardrail.json
}

resource "aws_iam_role_policy_attachment" "apply_guardrail" {
  role       = aws_iam_role.apply.name
  policy_arn = aws_iam_policy.apply_guardrail.arn
}
