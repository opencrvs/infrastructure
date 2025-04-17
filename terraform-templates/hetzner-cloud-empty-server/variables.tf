# Declare the hcloud_token variable from .tfvars
variable "hcloud_token" {
  sensitive = true # Requires terraform >= 0.14
}

variable "country_name" {
  description = "The country name for the Hetzner Cloud data center."
  default = "farajaland"
  type        = string
}

variable "users" {
  type = map(list(string))
  default = {
  }
}
