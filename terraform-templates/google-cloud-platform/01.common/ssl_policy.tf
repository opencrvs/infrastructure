
resource "google_compute_ssl_policy" "custom_restricted" { 
  name            = "custom-restricted" 
  project = var.project_id
  profile         = "RESTRICTED"
  min_tls_version = "TLS_1_2" 
}
