#!/bin/bash
set -e

# Redirect all output to a log file for debugging
exec > >(tee -i /var/log/startup-script.log)
exec 2>&1

echo "Starting sandbox VM provisioning..."

# Update and install dependencies
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release jq

# Add Docker's official GPG key
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes

# Set up the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Compose
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Ensure alti_deployer user exists
if ! id "alti_deployer" &>/dev/null; then
    useradd -m -s /bin/bash alti_deployer
fi

# Add alti_deployer to docker group
usermod -aG docker alti_deployer

# Ensure the docker service is enabled and running
systemctl enable docker
systemctl restart docker

echo "Sandbox VM provisioning complete. Docker is ready."
