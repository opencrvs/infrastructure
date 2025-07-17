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

variable "private_key_path" {
  description = "Private SSH key for nodes."
  type        = string
  default     = ""
}

variable "location" {
  description = "The location for the Hetzner Cloud resources."
  type        = string
  default     = "hil"
}

variable "master_server_type" {
  description = "Server type for the master node."
  type        = string
  default     = "cpx31"
}

variable "worker_server_type" {
  description = "Server type for the worker nodes."
  type        = string
  default     = "cpx31"
}