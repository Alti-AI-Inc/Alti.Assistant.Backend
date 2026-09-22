#!/bin/bash
# Deploy script for Liberty Center One OpenStack

echo "🚀 Initiating sovereign infrastructure deployment to Liberty Center One..."

cd "$(dirname "$0")"

# Initialize Terraform (downloads OpenStack provider)
echo "📦 Initializing Terraform..."
terraform init

# Validate configuration
echo "✅ Validating IaC..."
terraform validate

# Apply the infrastructure
echo "⚡ Deploying cluster..."
terraform apply -auto-approve

echo "✅ Deployment complete. The sovereign compute cluster is now online."
