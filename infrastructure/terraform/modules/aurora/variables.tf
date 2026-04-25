variable "project" { type = string }
variable "env" { type = string }
variable "vpc_id" { type = string }
variable "db_subnet_group" { type = string }
variable "postgres_engine_version" { type = string }
variable "instance_count" { type = number }
variable "instance_class" { type = string }
