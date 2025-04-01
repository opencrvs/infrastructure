# Bucket to store terraform state files for all project
resource "google_storage_bucket" "backend_terraform_bucket" {
  name          = "opencrvs-app-terraform-bucket"
  force_destroy = false
  location      = "EU"
  storage_class = "STANDARD"
  project       = var.project_id
  versioning {
    enabled = true
  }
}