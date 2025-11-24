# terraform/registry.tf

resource "google_artifact_registry_repository" "upr_repo" {
  location      = var.gcp_region
  repository_id = "upr-app-repo"
  description   = "Docker repository for the UPR application"
  format        = "DOCKER"
}