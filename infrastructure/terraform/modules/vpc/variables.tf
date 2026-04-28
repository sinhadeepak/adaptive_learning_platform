variable "project" {
  type        = string
  description = "Project tag prefix (e.g. alp)."
}

variable "env" {
  type        = string
  description = "Environment name (staging | prod)."
}

variable "cidr" {
  type        = string
  description = "VPC CIDR block."
}

variable "azs" {
  type        = list(string)
  description = "Availability zones to span."
}

variable "private_subnets" {
  type        = list(string)
  description = "Private subnet CIDRs (app + EKS nodes)."
}

variable "public_subnets" {
  type        = list(string)
  description = "Public subnet CIDRs (NLB, NAT)."
}

variable "database_subnets" {
  type        = list(string)
  description = "Isolated DB subnet CIDRs (Aurora, OpenSearch, Redis)."
}
