# Include Google Provider to configure your Google Cloud Platform infrastructure.
provider "google" {
  # credentials = var.credentials_file
}

terraform {
  # Configure terraform to persist state in Google Storage Bucket
  # Exact configuration of bucket is configured per env in ./envs/<env_name>/backendconfig.tfvars file
  backend "gcs" {
    bucket = "opencrvs-app-terraform-bucket"
    prefix = "states/gke-cluster"
  }

  # Include Google Provider as required provider globally
  required_providers {
    google = {
      source = "hashicorp/google"
      # version = "> 5.18.0"
    }
  }
}

# Import remote state from common section
data "terraform_remote_state" "common" {
  backend = "gcs"
  config = {
    bucket = "opencrvs-app-terraform-bucket"
    prefix = "states/common"
  }
}
