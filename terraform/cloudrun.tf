# terraform/cloudrun.tf

resource "google_vpc_access_connector" "upr_connector" {
  name          = "upr-vpc-connector"
  network       = google_compute_network.upr_vpc_network.name
  ip_cidr_range = "10.8.0.0/28"
  region        = var.gcp_region
  depends_on = [
    google_project_service.upr_apis["vpcaccess.googleapis.com"],
  ]
}

resource "google_cloud_run_v2_service" "upr_web" {
  name     = "upr-web-service"
  location = var.gcp_region
  
  template {
    containers {
      # FIX: Use the correct public placeholder image path as you discovered.
      image = "us-docker.pkg.dev/cloudrun/container/hello"
    }
    vpc_access {
      connector = google_vpc_access_connector.upr_connector.id
      egress    = "ALL_TRAFFIC"
    }
  }
}

resource "google_cloud_run_v2_service" "upr_worker" {
  name     = "upr-enrichment-worker"
  location = var.gcp_region

  template {
    containers {
      # FIX: Use the correct public placeholder image path.
      image = "us-docker.pkg.dev/cloudrun/container/hello"
    }
    vpc_access {
      connector = google_vpc_access_connector.upr_connector.id
      egress    = "ALL_TRAFFIC"
    }
  }
}