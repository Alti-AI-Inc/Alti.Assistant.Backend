variable "auth_url" {
  description = "The endpoint URL for Liberty Center One OpenStack Identity (Keystone)"
  type        = string
}

variable "tenant_name" {
  description = "The name of the Project (Tenant) in Liberty Center One"
  type        = string
}

variable "user_name" {
  description = "The username for OpenStack authentication"
  type        = string
}

variable "password" {
  description = "The password for OpenStack authentication"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "The region of Liberty Center One to deploy into"
  type        = string
  default     = "RegionOne"
}

variable "instance_count" {
  description = "Number of high-performance compute engines to spawn"
  type        = number
  default     = 3
}
