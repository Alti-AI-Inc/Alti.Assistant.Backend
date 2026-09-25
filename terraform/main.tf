terraform {
  required_providers {
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "~> 1.51.1"
    }
  }
}

provider "openstack" {
  user_name   = var.os_username
  password    = var.os_password
  tenant_name = var.os_project_name
  auth_url    = "https://keystone.libertycenterone.com/v3"
  region      = "RegionOne"
}

# 1. Zero-Trust Security Group
resource "openstack_networking_secgroup_v2" "aphura_secgroup" {
  name        = "aphura-enterprise-sg"
  description = "Strict ingress filtering for Aphura backend"
}

resource "openstack_networking_secgroup_rule_v2" "allow_https" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 443
  port_range_max    = 443
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.aphura_secgroup.id
}

# Allow internal gRPC traffic between nodes
resource "openstack_networking_secgroup_rule_v2" "allow_internal_grpc" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 50051
  port_range_max    = 50051
  remote_group_id   = openstack_networking_secgroup_v2.aphura_secgroup.id
  security_group_id = openstack_networking_secgroup_v2.aphura_secgroup.id
}

# 2. High-Performance API Gateway Node
resource "openstack_compute_instance_v2" "api_gateway_node" {
  name            = "aphura-gateway-prod"
  image_name      = "Ubuntu-22.04-LTS-BareMetal"
  flavor_name     = "compute.m5.8xlarge" # 32 vCPU, 128GB RAM
  key_pair        = "lco-deploy-key"
  security_groups = [openstack_networking_secgroup_v2.aphura_secgroup.name]
  
  network {
    name = "lco-internal-network"
  }
}

# 3. KVM / Wasm Sandbox Worker Node
resource "openstack_compute_instance_v2" "sandbox_worker_node" {
  name            = "aphura-sandbox-worker-1"
  image_name      = "Ubuntu-22.04-LTS-BareMetal"
  flavor_name     = "compute.m5.4xlarge" # 16 vCPU, 64GB RAM
  key_pair        = "lco-deploy-key"
  security_groups = [openstack_networking_secgroup_v2.aphura_secgroup.name]
  
  network {
    name = "lco-internal-network"
  }
}

# 4. Storage Volume for Postgres/Memgraph Data Sovereignty
resource "openstack_blockstorage_volume_v3" "database_volume" {
  name = "aphura-db-data"
  size = 1000 # 1TB NVMe
}

resource "openstack_compute_volume_attach_v2" "db_attach" {
  instance_id = openstack_compute_instance_v2.api_gateway_node.id
  volume_id   = openstack_blockstorage_volume_v3.database_volume.id
}
