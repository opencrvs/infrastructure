# Declare the hcloud_token variable from .tfvars
variable "hcloud_token" {
  sensitive = true # Requires terraform >= 0.14
}

variable "country_name" {
  description = "The country name for the Hetzner Cloud data center."
  type        = string
}

variable "users" {
  type = map(list(string))
  default = {
  }
}

variable "worker_private_ssh_key_path" {
  description = "Private SSH key for the worker nodes."
  type        = string
  default     = ""
}