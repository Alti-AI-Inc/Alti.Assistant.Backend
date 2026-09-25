variable "os_username" {
  description = "OpenStack Username for Liberty Center One"
  type        = string
  sensitive   = true
}

variable "os_password" {
  description = "OpenStack Password"
  type        = string
  sensitive   = true
}

variable "os_project_name" {
  description = "OpenStack Project/Tenant Name"
  type        = string
  default     = "Alti-AI-Production"
}
