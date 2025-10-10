module "gke" {
  source                 = "terraform-google-modules/kubernetes-engine/google//modules/beta-private-cluster-update-variant"
  version                = "~> 40.0.0"
  project_id             = var.project_id
  name                   = var.gke_cluster_name
  regional               = false
  kubernetes_version     = "latest"
  zones                  = [var.gke_cluster_location]
  network                = data.terraform_remote_state.common.outputs.gke_vpc_name
  subnetwork             = google_compute_subnetwork.vpc_subnetwork.name
  ip_range_pods          = "${var.gke_cluster_name}-pods-subnet"
  ip_range_services      = "${var.gke_cluster_name}-services-subnet"
  release_channel        = "REGULAR"
  enable_cost_allocation = true
  maintenance_start_time = "1970-01-01T22:00:00Z"
  maintenance_end_time   = "1970-01-02T02:00:00Z"
  maintenance_recurrence = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
  # TODO: Ensure that Compute Instances have Confidential Computing enabled
  # enable_confidential_nodes = true
  # TODO: Double check after cluster creation
  cluster_autoscaling = {
    autoscaling_profile = "OPTIMIZE_UTILIZATION"
    auto_repair         = true
    auto_upgrade        = true
    enabled             = false
    gpu_resources       = []
    min_cpu_cores       = 4
    max_cpu_cores       = 16
    min_memory_gb       = 16
    max_memory_gb       = 50
  }
  http_load_balancing        = true
  network_policy             = false
  registry_project_ids       = [var.project_id]
  horizontal_pod_autoscaling = true
  # Default: False
  filestore_csi_driver = false
  enable_gcfs        = true
  # TODO: Check option
  enable_private_endpoint = false
  enable_private_nodes    = true
  # TODO: 
  master_ipv4_cidr_block               = var.gke_master_ipv4_cidr_block
  monitoring_enable_managed_prometheus = false
  dns_cache                            = false
  remove_default_node_pool             = true

  node_pools = [
    {
      name         = "main-pool"
      machine_type = var.gke_machine_type
      #   node_locations            = var.gke_cluster_location
      min_count                 = 1
      max_count                 = 20
      local_ssd_count           = 0
      spot                      = var.gke_use_spot_instance_type
      local_ssd_ephemeral_count = 0
      disk_size_gb              = 20
      disk_type                 = "pd-standard"
      image_type                = "COS_CONTAINERD"
      # Image steaming
      enable_gcfs        = true
      enable_gvnic       = false
      logging_variant    = "DEFAULT"
      auto_repair        = true
      auto_upgrade       = true
      preemptible        = false
      initial_node_count = 1
    }
  ]

  node_pools_oauth_scopes = {
    all = [
      # Write access to Stackdriver Logging
      "https://www.googleapis.com/auth/logging.write",
      # Write access to Stackdriver Monitoring
      "https://www.googleapis.com/auth/monitoring",
      # Read-only access to Google Cloud Storage
      "https://www.googleapis.com/auth/devstorage.read_only"
    ]
  }

  node_pools_labels = {
    all = {}

    default-node-pool = {
      default-node-pool = true
    }
  }

  node_pools_metadata = {
    all = {
      # Block project-wide SSH keys
      "block-project-ssh-keys" = "TRUE"
    }

    default-node-pool = {
      "block-project-ssh-keys"        = "TRUE"
      node-pool-metadata-custom-value = "my-node-pool"
    }
  }

  node_pools_taints = {
    all = []

    default-node-pool = [
      {
        key    = "default-node-pool"
        value  = true
        effect = "PREFER_NO_SCHEDULE"
      },
    ]
  }

  node_pools_tags = {
    all = [
      var.gke_cluster_name
    ]

    default-node-pool = [
      "default-node-pool",
    ]
  }
}