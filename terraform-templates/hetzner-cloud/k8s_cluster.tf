locals {
  master_ip = "10.2.1.1"
}

module "master_node" {
  source             = "./node"
  ip                 = local.master_ip
  name               = "${var.country_name}-k8s-master"
  private_network_id = hcloud_network.private_network.id
  location = var.location
  user_data = file("cloud-init-master.yaml")
  depends_on = [ hcloud_network_subnet.private_network_subnet ]
  server_type = var.master_server_type
}

module "worker_node" {
    count = 2
    location = var.location
  source             = "./node"
  name               = "${var.country_name}-k8s-worker-${count.index}"
  private_network_id = hcloud_network.private_network.id
  user_data = file("cloud-init-worker.yaml")
  depends_on = [ module.master_node ]
  server_type = var.worker_server_type
}
