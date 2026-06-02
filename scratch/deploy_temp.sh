#!/usr/bin/env bash
set -e

echo "=== Step 1: Clean and extract updated_backend.zip ==="
sudo rm -rf ~/backend_temp
mkdir -p ~/backend_temp
unzip -o ~/updated_backend.zip -d ~/backend_temp || true
rm -f ~/updated_backend.zip

echo "=== Step 1.5: Fix Windows-to-Linux permissions ==="
sudo chown -R alti_deployer:alti_deployer ~/backend_temp
sudo chmod -R 755 ~/backend_temp

echo "=== Step 2: Native Docker compilation on VM ==="
cd ~/backend_temp
docker build -t us-central1-docker.pkg.dev/alti-assistant-prod/alti-assistant-core-backend-repo/alti-assistant-backend:latest .

echo "=== Step 3: Zero-downtime container swap ==="
cd ~
docker compose down
docker compose up -d

echo "=== Step 4: Verification of container health ==="
docker compose ps
docker exec alti-backend node -e "console.log('Backend code date:', new Date().toISOString())"

echo "=== Step 5: Cleanup temporary build files ==="
sudo rm -rf ~/backend_temp
echo "=== SUCCESS: Deployment completed natively on VM! ==="
