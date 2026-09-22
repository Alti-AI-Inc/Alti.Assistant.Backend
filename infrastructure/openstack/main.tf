# Liberty Center One - OpenStack Infrastructure as Code (Terraform)
# Defines the sovereign sovereign compute cluster for Aphura

terraform {
  required_providers {
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "~> 1.51.1"
    }
  }
}

provider "openstack" {
  auth_url    = var.auth_url
  tenant_name = var.tenant_name
  user_name   = var.user_name
  password    = var.password
  region      = var.region
}

# 1. Sovereign Networking
resource "openstack_networking_network_v2" "aphura_net" {
  name           = "aphura-sovereign-net"
  admin_state_up = "true"
}

resource "openstack_networking_subnet_v2" "aphura_subnet" {
  name       = "aphura-sovereign-subnet"
  network_id = openstack_networking_network_v2.aphura_net.id
  cidr       = "10.0.0.0/24"
  ip_version = 4
}

# 2. Strict Security Groups
resource "openstack_compute_secgroup_v2" "aphura_sg" {
  name        = "aphura-security-group"
  description = "Strict sovereign router firewall rules"

  rule {
    from_port   = 22
    to_port     = 22
    ip_protocol = "tcp"
    cidr        = "0.0.0.0/0"
  }

  rule {
    from_port   = 443
    to_port     = 443
    ip_protocol = "tcp"
    cidr        = "0.0.0.0/0"
  }
}

# 3. High-Performance Compute Nodes (Liberty Center One Bare Metal / Heavy VMs)
resource "openstack_compute_instance_v2" "aphura_engine" {
  count           = var.instance_count
  name            = "aphura-engine-${count.index}"
  image_name      = "Ubuntu-22.04-LTS"
  flavor_name     = "sovereign.compute.xlarge"
  security_groups = [openstack_compute_secgroup_v2.aphura_sg.name]

  network {
    name = openstack_networking_network_v2.aphura_net.name
  }

  # User data to instantly bootstrap the Temporal + Sovereign Router daemon
  user_data = <<-EOF
              #!/bin/bash
              apt-get update && apt-get install -y docker.io nginx curl
              systemctl enable docker
              systemctl start docker
              # Pull and run the Aphura Sovereign Docker container
              docker run -d --name aphura-backend -p 443:443 -p 80:80 aphura/aphura-backend:latest
              EOF
}

# 4. Load Balancer for the Sovereign Prompt Engine
resource "openstack_lb_loadbalancer_v2" "aphura_lb" {
  name          = "aphura-main-lb"
  vip_subnet_id = openstack_networking_subnet_v2.aphura_subnet.id
}
