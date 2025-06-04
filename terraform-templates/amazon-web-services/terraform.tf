# Copyright (c) HashiCorp, Inc.
# SPDX-License-Identifier: MPL-2.0

terraform {
  required_version = "~> 1.3"

  backend "s3" {
    bucket         = "opencrvs-terraform-state"
    key            = "default/terraform.tfstate"
    region         = "eu-central-1"
    encrypt        = true
  }

}
