# Create a private network for the cluster
resource "hcloud_network" "private_network" {
  name     = var.country_name
  ip_range = "10.2.0.0/16"
}

resource "hcloud_network_subnet" "private_network_subnet" {
  type         = "cloud"
  network_id   = hcloud_network.private_network.id
  network_zone = "us-west"
  ip_range     = "10.2.1.0/24"
}

output "network_id" {
  value = hcloud_network.private_network.id
}
