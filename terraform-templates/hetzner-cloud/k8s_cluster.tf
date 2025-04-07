module "master_node" {
  source             = "./node"
  ip                 = "10.0.1.1"
  name               = "${var.country_name}-master-node"
  private_network_id = hcloud_network.private_network.id
  location = "hel1"
  user_data = file("cloud-init-master.yaml")
#   user_data = templatefile("cloud-init-master.yaml", {
#     users = var.users,
#     }
#   )
}

module "worker_node" {
    count = 2
    location = "hel1"
  source             = "./node"
  name               = "${var.country_name}-worker-node-${count.index}"
  private_network_id = hcloud_network.private_network.id
  user_data = templatefile(
    "cloud-init-worker.yaml",
    {
      users = var.users,
      worker_private_ssh_key = file("~/.ssh/opencrvs")
    }
  )
  depends_on = [ module.master_node ]
}
