// Per-service secret scaffolding.
// Values are populated out-of-band (Rotation Lambda or manual) — Terraform
// only creates the secret and its access policies.

resource "aws_secretsmanager_secret" "service" {
  for_each = toset(var.services)

  name        = "${var.project}/${var.env}/${each.value}"
  description = "Secrets for ${each.value} service in ${var.env}"
  // Rotate every 90 days — Lambda attached separately per secret (Sprint 0 Week 2).
}

resource "aws_secretsmanager_secret_policy" "service" {
  for_each = aws_secretsmanager_secret.service

  secret_arn = each.value.arn
  policy     = data.aws_iam_policy_document.service[each.key].json
}

data "aws_iam_policy_document" "service" {
  for_each = aws_secretsmanager_secret.service

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [each.value.arn]
    principals {
      type        = "AWS"
      // Each service has an IRSA role — TODO: pass the role ARN map in.
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/service"
      values   = [each.key]
    }
  }
}
