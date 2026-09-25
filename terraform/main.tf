terraform {
  required_providers {
    liberty = {
      source  = "libertycenterone/liberty"
      version = "~> 1.0.0"
    }
  }
}

provider "liberty" {
  api_key = var.liberty_api_key
}

resource "liberty_kubernetes_cluster" "aphura_cluster" {
  name    = "aphura-production-k8s"
  region  = "us-east-1"
  version = "1.28"
  
  node_pool {
    name       = "agent-pool"
    size       = "baremetal.xlarge"
    node_count = 3
    auto_scale = true
    min_nodes  = 3
    max_nodes  = 10
  }
}

resource "liberty_volume" "memgraph_storage" {
  name = "memgraph-data"
  size = 500 # GB
  type = "nvme"
}
