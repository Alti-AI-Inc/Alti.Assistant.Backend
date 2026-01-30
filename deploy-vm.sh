#!/bin/bash

# Deployment script for Alti Assistant Backend (Mac/Linux)
# Usage: ./deploy-vm.sh [options]
# Options:
#   -v, --version VERSION     Set version tag (default: v0.1.0)
#   -u, --user USER          VM user (default: emondarock)
#   -h, --host HOST          VM host (default: 104.197.53.196)
#   -k, --ssh-key KEY        SSH key path (default: ~/.ssh/alti-vm-key)
#   -f, --compose-file FILE  Docker compose file (default: docker-compose.yml)
#   -d, --compose-dir DIR    Compose directory on VM (default: ~)
#   -s, --skip-build         Skip Docker build step
#   --help                   Show this help message

set -e

# Default values
VERSION="v0.1.0"
VM_USER="emondarock"
VM_HOST="104.197.53.196"
SSH_KEY="$HOME/.ssh/alti-vm-key"
COMPOSE_FILE="docker-compose.yml"
COMPOSE_DIR="~"
SKIP_BUILD=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -v|--version)
      VERSION="$2"
      shift 2
      ;;
    -u|--user)
      VM_USER="$2"
      shift 2
      ;;
    -h|--host)
      VM_HOST="$2"
      shift 2
      ;;
    -k|--ssh-key)
      SSH_KEY="$2"
      shift 2
      ;;
    -f|--compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    -d|--compose-dir)
      COMPOSE_DIR="$2"
      shift 2
      ;;
    -s|--skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -v, --version VERSION     Set version tag (default: v0.1.0)"
      echo "  -u, --user USER          VM user (default: emondarock)"
      echo "  -h, --host HOST          VM host (default: 104.197.53.196)"
      echo "  -k, --ssh-key KEY        SSH key path (default: ~/.ssh/alti-vm-key)"
      echo "  -f, --compose-file FILE  Docker compose file (default: docker-compose.yml)"
      echo "  -d, --compose-dir DIR    Compose directory on VM (default: ~)"
      echo "  -s, --skip-build         Skip Docker build step"
      echo "  --help                   Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Docker registry configuration
REGISTRY="us-central1-docker.pkg.dev/alti-assistant-prod/alti-assistant-core-backend-repo"
IMAGE_NAME="alti-assistant-backend"
IMAGE_TAG_VERSION="${REGISTRY}/${IMAGE_NAME}:${VERSION}"
IMAGE_TAG_LATEST="${REGISTRY}/${IMAGE_NAME}:latest"

# Colors
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo -e "\n${MAGENTA}========================================"
echo -e "   Alti Assistant Deployment Script"
echo -e "========================================${NC}\n"

echo -e "${CYAN}Version: ${VERSION}"
echo -e "VM: ${VM_USER}@${VM_HOST}"
echo -e "Compose Directory: ${COMPOSE_DIR}"
echo -e "Compose File: ${COMPOSE_FILE}${NC}"

# Step 1: Build and Push Docker Image
if [ "$SKIP_BUILD" = false ]; then
    echo -e "\n${YELLOW}Building and pushing Docker image...${NC}"
    
    if docker buildx build \
        --platform linux/amd64,linux/arm64 \
        -t "$IMAGE_TAG_VERSION" \
        -t "$IMAGE_TAG_LATEST" \
        --push .; then
        echo -e "${GREEN}Docker image built and pushed successfully!${NC}"
    else
        echo -e "${RED}ERROR: Failed to build and push Docker image${NC}"
        exit 1
    fi
else
    echo -e "${CYAN}Skipping Docker build (--skip-build flag set)${NC}"
fi

# Step 2: SSH into VM and deploy
echo -e "\n${YELLOW}Connecting to VM and deploying...${NC}"

# Create deployment commands
DEPLOY_COMMANDS=$(cat <<'EOF'
set -e
echo 'Navigating to compose directory...'
cd ~COMPOSE_DIR~

echo 'Stopping existing containers...'
docker-compose -f ~COMPOSE_FILE~ down

echo 'Pulling latest images...'
docker-compose -f ~COMPOSE_FILE~ pull

echo 'Starting containers...'
docker-compose -f ~COMPOSE_FILE~ up -d

echo 'Checking container status...'
docker-compose -f ~COMPOSE_FILE~ ps

echo 'Deployment completed successfully!'
EOF
)

# Replace placeholders
DEPLOY_COMMANDS="${DEPLOY_COMMANDS//\~COMPOSE_DIR\~/$COMPOSE_DIR}"
DEPLOY_COMMANDS="${DEPLOY_COMMANDS//\~COMPOSE_FILE\~/$COMPOSE_FILE}"

# Execute deployment commands via SSH
if echo "$DEPLOY_COMMANDS" | ssh -i "$SSH_KEY" "${VM_USER}@${VM_HOST}" "bash -s"; then
    echo -e "${GREEN}Deployment completed successfully!${NC}"
else
    echo -e "${RED}ERROR: Failed to deploy to VM${NC}"
    exit 1
fi

# Step 3: Show logs (optional)
echo -e "\n${YELLOW}Fetching recent logs...${NC}"
if ssh -i "$SSH_KEY" "${VM_USER}@${VM_HOST}" "cd $COMPOSE_DIR && docker-compose -f $COMPOSE_FILE logs --tail=20"; then
    :
else
    echo -e "${RED}WARNING: Failed to fetch logs${NC}"
fi

echo -e "\n${MAGENTA}========================================"
echo -e "${GREEN}Deployment workflow completed!"
echo -e "${MAGENTA}========================================${NC}\n"

echo -e "${CYAN}Useful commands:${NC}"
echo -e "${GRAY}  View logs:    ssh -i $SSH_KEY ${VM_USER}@${VM_HOST} 'cd $COMPOSE_DIR && docker-compose logs -f'"
echo -e "  Check status: ssh -i $SSH_KEY ${VM_USER}@${VM_HOST} 'cd $COMPOSE_DIR && docker-compose ps'"
echo -e "  Restart:      ssh -i $SSH_KEY ${VM_USER}@${VM_HOST} 'cd $COMPOSE_DIR && docker-compose restart'${NC}"
