output "cluster_endpoint" { value = module.aurora.cluster_endpoint }
output "cluster_reader_endpoint" { value = module.aurora.cluster_reader_endpoint }
output "cluster_arn" { value = module.aurora.cluster_arn }
output "master_user_secret" { value = module.aurora.cluster_master_user_secret }
