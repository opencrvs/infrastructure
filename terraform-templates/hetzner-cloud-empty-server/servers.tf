

module "opencrvs_v16_template" {
  source             = "./node"
  name               = "${var.country_name}-v16"
  private_network_id = hcloud_network.private_network.id
  location = "hel1"
  user_data = file("cloud-init.yaml")
  # user_data = templatefile("cloud-init-master.yaml", file("~/.ssh/tf_hetzner.pub"))
}
