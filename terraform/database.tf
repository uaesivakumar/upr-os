# terraform/database.tf

# Generate a secure, random password for the database
resource "random_password" "db_password" {
  length  = 24
  special = true
}

# The Cloud SQL for PostgreSQL instance
resource "google_sql_database_instance" "upr_db" {
  name             = "upr-db-instance"
  database_version = "POSTGRES_15"
  region           = var.gcp_region
  
  settings {
    tier = "db-g1-small"
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.upr_vpc_network.id
    }
  }

  root_password = random_password.db_password.result
  
  # FIX: Make the database instance wait for the final network connection.
  depends_on = [google_service_networking_connection.redis_vpc_connection]
}