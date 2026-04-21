output "bucket_name" { value = aws_s3_bucket.assets.id }
output "bucket_arn" { value = aws_s3_bucket.assets.arn }
output "cloudfront_domain" { value = aws_cloudfront_distribution.cdn.domain_name }
output "cloudfront_distribution_id" { value = aws_cloudfront_distribution.cdn.id }
