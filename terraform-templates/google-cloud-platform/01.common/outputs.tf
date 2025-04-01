output "gke_vpc_self_link" {
  value = google_compute_network.vpc_network.self_link
}

output "gke_vpc_name" {
  value = google_compute_network.vpc_network.name
}

output "server_tls_policy" {
  value = google_compute_ssl_policy.custom_restricted.id
}