# terraform/redis.tf

# A private network for our services to communicate securely
resource "google_compute_network" "upr_vpc_network" {
  name                    = "upr-vpc-network"
  auto_create_subnetworks = false
}

resource "google_compute_global_address" "private_ip_alloc" {
  name          = "private-ip-alloc"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.upr_vpc_network.id
}

resource "google_service_networking_connection" "redis_vpc_connection" {
  network                 = google_compute_network.upr_vpc_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]

  # FIX: Explicitly wait for the Service Networking API to be enabled first.
  depends_on = [
    google_project_service.upr_apis["servicenetworking.googleapis.com"]
  ]
}

# The Redis instance itself
resource "google_redis_instance" "upr_redis" {
  name           = "upr-redis-instance"
  tier           = "BASIC"
  memory_size_gb = 1
  location_id    = "${var.gcp_region}-a"
  
  authorized_network = google_compute_network.upr_vpc_network.id

  # FIX: Also make the redis instance wait for the final network connection.
  depends_on = [google_service_networking_connection.redis_vpc_connection]
}