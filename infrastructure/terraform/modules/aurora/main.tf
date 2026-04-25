// Aurora PostgreSQL 15 cluster (Multi-AZ).
// 9 schemas (per infra design) live in one cluster in staging;
// prod may split payment/auth into a dedicated cluster — see GAP-11.

module "aurora" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = "~> 9.10"

  name              = "${var.project}-${var.env}"
  engine            = "aurora-postgresql"
  engine_version    = var.postgres_engine_version
  engine_mode       = "provisioned"
  storage_encrypted = true

  vpc_id               = var.vpc_id
  db_subnet_group_name = var.db_subnet_group

  instances = {
    for idx in range(var.instance_count) : "instance-${idx}" => {}
  }
  instance_class = var.instance_class

  master_username             = "alp_admin"
  manage_master_user_password = true   // managed in Secrets Manager

  // Backups + PITR.
  backup_retention_period = var.env == "prod" ? 30 : 7
  preferred_backup_window = "17:00-18:00"   // 22:30-23:30 IST

  apply_immediately      = var.env != "prod"
  deletion_protection    = var.env == "prod"
  skip_final_snapshot    = var.env != "prod"

  // Performance Insights + enhanced monitoring for oncall visibility.
  performance_insights_enabled    = true
  performance_insights_retention_period = 7
  monitoring_interval             = 60

  // Parameter group — pgaudit enabled (GAP-04).
  // TODO: provide parameter_group_name with pgaudit config in Sprint 0 Week 2.

  tags = {
    Component = "aurora"
  }
}
