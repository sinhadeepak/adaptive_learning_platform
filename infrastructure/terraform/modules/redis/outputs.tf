output "configuration_endpoint" {
  value = aws_elasticache_replication_group.redis.configuration_endpoint_address
}
output "primary_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}
output "security_group_id" {
  value = aws_security_group.redis.id
}
