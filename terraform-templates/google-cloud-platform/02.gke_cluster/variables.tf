variable "location" {
  type    = string
}

variable "project_id" {
  type    = string
}

variable "env" {
  type = string

}

variable "gke_cluster_name" {
  type = string
}


variable "gke_cluster_location" {
  type    = string
  default = "europe-west1-b"

}

variable "gke_use_spot_instance_type" {
  type    = bool
  default = true

}

variable "gke_master_ipv4_cidr_block" {
  type = string

}
variable "gke_node_ipv4_cidr_block" {
  type = string
}

variable "gke_pod_ipv4_cidr_block" {
  type = string
}

variable "gke_services_ipv4_cidr_block" {
  type = string
}

variable "gke_machine_type" {
  type = string
}
