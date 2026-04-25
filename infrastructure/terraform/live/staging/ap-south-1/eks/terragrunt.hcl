include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../../modules/eks"
}

dependency "vpc" {
  config_path = "../vpc"
  mock_outputs = {
    vpc_id             = "vpc-MOCK"
    private_subnet_ids = ["subnet-MOCK-1", "subnet-MOCK-2", "subnet-MOCK-3"]
  }
}

inputs = {
  vpc_id             = dependency.vpc.outputs.vpc_id
  private_subnet_ids = dependency.vpc.outputs.private_subnet_ids
}
