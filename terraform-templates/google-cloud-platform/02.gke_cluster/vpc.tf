
# import {
#   id = "projects/${var.project_id}/regions/${var.location}/subnetworks/gke-${var.gke_cluster_name}-subnet-${var.env}"
#   to = google_compute_subnetwork.vpc_subnetwork
# }

resource "google_compute_subnetwork" "vpc_subnetwork" {
  name          = "gke-${var.gke_cluster_name}-subnet-${var.env}"
  project       = var.project_id
  description   = "subnetwork for ${var.env} cluster"
  ip_cidr_range = var.gke_node_ipv4_cidr_block
  region        = var.location
  network       = data.terraform_remote_state.common.outputs.gke_vpc_self_link
  secondary_ip_range {
    range_name    = "${var.gke_cluster_name}-pods-subnet"
    ip_cidr_range = var.gke_pod_ipv4_cidr_block
  }

  secondary_ip_range {
    range_name    = "${var.gke_cluster_name}-services-subnet"
    ip_cidr_range = var.gke_services_ipv4_cidr_block
  }
}
