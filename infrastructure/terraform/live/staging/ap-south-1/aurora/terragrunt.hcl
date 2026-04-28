include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../../modules/aurora"
}

dependency "vpc" {
  config_path = "../vpc"
  mock_outputs = {
    vpc_id                = "vpc-MOCK"
    database_subnet_group = "alp-staging-db"
  }
}

inputs = {
  vpc_id          = dependency.vpc.outputs.vpc_id
  db_subnet_group = dependency.vpc.outputs.database_subnet_group
}
