variable "name" {
    description = "Name of the node"
    type        = string
}

variable "server_type" {
    description = "Type of the server"
    type        = string
    default     = "cax11"
  
}

variable "location" {
  description = "Location of the server"
  type        = string
  default     = "fsn1"
  
}

variable "os_image" {
  description = "Operating system image"
  type        = string
  default     = "ubuntu-24.04"
  
}

variable "private_network_id" {
  description = "Private network ID"
  type        = string
  
}

variable "ip" {
  type = string
  default = null
}