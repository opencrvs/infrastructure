resource "google_compute_network" "vpc_network" {
  name                    = "gke-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
}

resource "google_compute_router" "nat_router" {
  name    = "${google_compute_network.vpc_network.name}-nat-router"
  network = google_compute_network.vpc_network.name
  region  = "europe-west1"
  project = var.project_id
}

resource "google_compute_address" "nat_ips" {
  count   = var.nat_ip_count
  name    = "gke-nat-ip-${count.index + 1}"
  region  = "europe-west1"
  project = var.project_id
}

resource "google_compute_router_nat" "nat_config" {
  name                               = "${google_compute_network.vpc_network.name}-nat-config"
  router                             = google_compute_router.nat_router.name
  region                             = "europe-west1"
  project                            = var.project_id
  nat_ip_allocate_option             = "MANUAL_ONLY"
  nat_ips = google_compute_address.nat_ips.*.self_link
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  min_ports_per_vm = 8192
  max_ports_per_vm = 65536

  log_config {
    enable = false
    filter = "ALL"
  }
}

resource "google_compute_global_address" "private_ip_alloc" {
  name          = "opencrvs-private-connection-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc_network.name
  project       = var.project_id
}

# Create a private connection
resource "google_service_networking_connection" "service_networking" {
  network                 = google_compute_network.vpc_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}