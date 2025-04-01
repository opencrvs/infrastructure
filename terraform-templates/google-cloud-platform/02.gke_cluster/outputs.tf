output "k8s_instance_group" {
  value = module.gke.instance_group_urls.0
}

output "cluster_location" {
    value = var.gke_cluster_location
}

output "cluster_name" {
    value = var.gke_cluster_name
}

locals {
  a = tostring(module.gke.endpoint)
}
output "cluster_endpoint" {
  value = nonsensitive(module.gke.endpoint)
}
