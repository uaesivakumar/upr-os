# terraform/main.tf

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# This block ensures the required APIs are enabled programmatically.
resource "google_project_service" "upr_apis" {
  project = var.gcp_project_id
  # Loop through a list of required APIs
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "redis.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com" # <-- Added this line
  ])
  service                    = each.key
  disable_dependent_services = true
}