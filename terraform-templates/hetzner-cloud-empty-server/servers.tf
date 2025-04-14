

module "opencrvs_v16_template" {
  source             = "./node"
  name               = "${var.country_name}-v16"
  private_network_id = hcloud_network.private_network.id
  location = "hel1"
  user_data = templatefile("cloud-init.yaml", {
    ssh_key = trimspace(file(".ssh/tf_hetzner.pub"))
  })
}
