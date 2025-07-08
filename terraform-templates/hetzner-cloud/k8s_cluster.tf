locals {
  master_ip = "10.1.1.1"
}

module "master_node" {
  source             = "./node"
  ip                 = local.master_ip
  name               = "${var.country_name}-k8s-master"
  private_network_id = hcloud_network.private_network.id
  location = "nbg1"
  user_data = file("cloud-init-master.yaml")
  depends_on = [ hcloud_network_subnet.private_network_subnet ]
#   user_data = templatefile("cloud-init-master.yaml", {
#     users = var.users,
#     }
#   )
}

module "worker_node" {
    count = 2
    location = "nbg1"
  source             = "./node"
  name               = "${var.country_name}-k8s-worker-${count.index}"
  private_network_id = hcloud_network.private_network.id
  user_data = templatefile(
    "cloud-init-worker.yaml",
    {
      users = var.users,
      master_ip = local.master_ip,
      worker_private_ssh_key = file("~/.ssh/vmudryi-opencrvs")
    }
  )
  depends_on = [ module.master_node ]
}
