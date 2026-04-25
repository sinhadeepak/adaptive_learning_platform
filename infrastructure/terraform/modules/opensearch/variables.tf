variable "project" { type = string }
variable "env" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "eks_node_security_group_id" { type = string }
variable "opensearch_version" { type = string }
variable "instance_type" { type = string }
variable "instance_count" { type = number }
