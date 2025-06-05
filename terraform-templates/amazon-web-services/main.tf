# Copyright (c) HashiCorp, Inc.
# SPDX-License-Identifier: MPL-2.0
# Source: http://developer.hashicorp.com/terraform/tutorials/kubernetes/eks

provider "aws" {
  region = var.region
  # Make sure credentials are configured with aws CLI
  shared_credentials_files = ["~/.aws/credentials"]
}

resource "aws_s3_bucket" "terraform-state" {
  bucket = "opencrvs-terraform-state"
}


# Filter out local zones, which are not currently supported 
# with managed node groups
data "aws_availability_zones" "available" {
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.21.0"

  name = "demo-vpc"

  cidr = "10.0.0.0/16"
  azs  = slice(data.aws_availability_zones.available.names, 0, 3)

  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.4.0/24", "10.0.5.0/24", "10.0.6.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.36.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.32"

  cluster_endpoint_public_access           = true
  enable_cluster_creator_admin_permissions = true

  cluster_addons = {
    aws-ebs-csi-driver = {
      service_account_role_arn = module.irsa-ebs-csi.iam_role_arn
    }
    amazon-cloudwatch-observability = {
      resolve_conflicts = "OVERWRITE"
      service_account_role_arn = module.irsa-cloudwatch.iam_role_arn
    }
    metrics-server = {
      resolve_conflicts = "OVERWRITE"
    }
  }

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  eks_managed_node_group_defaults = {
    ami_type = "AL2023_x86_64_STANDARD"

  }

  eks_managed_node_groups = {
    default = {
      capacity_type  = "SPOT"
      name = "default"
      # TODO: change to t3.medium or t3.large
      instance_types = ["t3a.large"]

      min_size     = 1
      max_size     = 10
      desired_size = 5
    }
  }
}


# https://aws.amazon.com/blogs/containers/amazon-ebs-csi-driver-is-now-generally-available-in-amazon-eks-add-ons/ 
data "aws_iam_policy" "ebs_csi_policy" {
  arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

module "irsa-ebs-csi" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-assumable-role-with-oidc"
  version = "5.55.0"

  create_role                   = true
  role_name                     = "AmazonEKSTFEBSCSIRole-${module.eks.cluster_name}"
  provider_url                  = module.eks.oidc_provider
  role_policy_arns              = [data.aws_iam_policy.ebs_csi_policy.arn]
  oidc_fully_qualified_subjects = ["system:serviceaccount:kube-system:ebs-csi-controller-sa"]
}

# Custom role for Cloud Watch add-on
data "aws_iam_policy" "cloudwatch_observability_policy" {
  arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

module "irsa-cloudwatch" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-assumable-role-with-oidc"
  version = "5.55.0"

  create_role                   = true
  role_name                     = "AmazonEKSTFCloudWatchRole-${module.eks.cluster_name}"
  provider_url                  = module.eks.oidc_provider
  role_policy_arns              = [data.aws_iam_policy.cloudwatch_observability_policy.arn]
  oidc_fully_qualified_subjects = ["system:serviceaccount:amazon-cloudwatch:cloudwatch-agent"]
}
