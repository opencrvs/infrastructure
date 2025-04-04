module "master_node" {
  source = "./node"
  ip="10.0.1.1"
  name = "vadym-master-node"
  private_network_id = hcloud_network.private_network.id
}
