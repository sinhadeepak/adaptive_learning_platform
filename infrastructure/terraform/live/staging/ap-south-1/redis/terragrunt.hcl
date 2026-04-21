include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../../modules/redis"
}

dependency "vpc" {
  config_path = "../vpc"
  mock_outputs = {
    vpc_id             = "vpc-MOCK"
    private_subnet_ids = ["subnet-MOCK-1", "subnet-MOCK-2", "subnet-MOCK-3"]
  }
}

dependency "eks" {
  config_path = "../eks"
  mock_outputs = {
    cluster_security_group_id = "sg-MOCK-eks"
  }
}

inputs = {
  vpc_id                     = dependency.vpc.outputs.vpc_id
  subnet_ids                 = dependency.vpc.outputs.private_subnet_ids
  eks_node_security_group_id = dependency.eks.outputs.cluster_security_group_id
}
