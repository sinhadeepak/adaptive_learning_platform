include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../../modules/vpc"
}

inputs = {
  cidr             = "10.10.0.0/16"
  azs              = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
  private_subnets  = ["10.10.1.0/24",  "10.10.2.0/24",  "10.10.3.0/24"]
  public_subnets   = ["10.10.11.0/24", "10.10.12.0/24", "10.10.13.0/24"]
  database_subnets = ["10.10.21.0/24", "10.10.22.0/24", "10.10.23.0/24"]
}
