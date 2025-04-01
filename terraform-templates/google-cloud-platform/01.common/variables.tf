# File for defining global variables. Exact value variables can be set per env using ./envs/<env-name>/terraform.tfvars file
# variable "tf_credentials_file" {
#   type        = string
#   description = "Credentials file to use for Terraform"
#   default     = "~/.secret/tf-sa.json"
#   sensitive   = true
# }

variable "project_id" {
  type    = string
  default = "opencrvs-on-k8s"
}

variable "location" {
  type    = string
  default = "europe-west1"

}


variable "enabled_apis" {
  type        = set(string)
  description = "List enabled APIs for project here"
  # APIs enabled in scope of Check Point CloudGuard (Dome 9): Identity for integration
  default = [
    "compute.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "container.googleapis.com",
    "iam.googleapis.com",
    # "appengine.googleapis.com",
    # "bigquery.googleapis.com",
    # "cloudfunctions.googleapis.com",
    # "sqladmin.googleapis.com",
    # "bigtableadmin.googleapis.com",
    "pubsub.googleapis.com",
    "redis.googleapis.com",
    "serviceusage.googleapis.com",
    "servicenetworking.googleapis.com",
    "cloudkms.googleapis.com",
    "admin.googleapis.com",
  ]
}

variable "nat_ip_count" {
  description = "Number of NAT IP addresses to allocate"
  type        = number
  default     = 1  # Change this to the number of IP addresses you need
}
