output "plan_role_arn" {
  value       = aws_iam_role.plan.arn
  description = "Add as GitHub Actions secret AWS_TF_PLAN_ROLE_<ENV>."
}

output "apply_role_arn" {
  value       = aws_iam_role.apply.arn
  description = "Add as GitHub Actions secret AWS_TF_APPLY_ROLE_<ENV>."
}

output "oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}
