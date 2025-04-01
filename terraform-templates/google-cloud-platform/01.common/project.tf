# Enable APIs
resource "google_project_service" "enabled_apis" {
  for_each           = var.enabled_apis
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false // Set to false to prevent the API from being disabled if the resource is destroyed.
}