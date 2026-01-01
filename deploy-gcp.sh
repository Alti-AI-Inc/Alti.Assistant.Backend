#!/bin/bash

# GCP Cloud Run Deployment Script for Alti Assistant Backend
# Usage: ./deploy-gcp.sh [PROJECT_ID] [REGION] [SERVICE_NAME]

# Color codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values
PROJECT_ID="${1:-alti-assistant-prod}"
REGION="${2:-us-central1}"
SERVICE_NAME="${3:-alti-assistant-backend}"
MEMORY="4Gi"
CPU="2"
MIN_INSTANCES=1
MAX_INSTANCES=4
TIMEOUT=300
ENV_FILE="env.yaml"

echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}Deploying Alti Assistant to GCP Cloud Run${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# Check if env.yaml exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: Environment file '$ENV_FILE' not found!${NC}"
    exit 1
fi

echo -e "${GREEN}Using environment file: $ENV_FILE${NC}"
echo ""

# Set the project
echo -e "${YELLOW}Setting GCP project to: $PROJECT_ID${NC}"
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo ""
echo -e "${YELLOW}Enabling required GCP APIs...${NC}"
gcloud services enable artifactregistry.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com

# Create Artifact Registry repository (if it doesn't exist)
echo ""
echo -e "${YELLOW}Creating Artifact Registry repository...${NC}"
gcloud artifacts repositories create alti-assistant-core-backend-repo \
    --repository-format=docker \
    --location="$REGION" \
    --description="Alti assistant core backend Docker images" 2>/dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Repository created successfully${NC}"
else
    echo -e "${YELLOW}Repository already exists or creation failed (continuing...)${NC}"
fi

# Configure Docker authentication
echo ""
echo -e "${YELLOW}Configuring Docker authentication...${NC}"
gcloud auth configure-docker "$REGION-docker.pkg.dev"

# Build the Docker image
IMAGE_TAG="$REGION-docker.pkg.dev/$PROJECT_ID/alti-assistant-core-backend-repo/$SERVICE_NAME:latest"
echo ""
echo -e "${YELLOW}Building Docker image: $IMAGE_TAG${NC}"
docker build -t "$IMAGE_TAG" .

if [ $? -ne 0 ]; then
    echo -e "${RED}Docker build failed!${NC}"
    exit 1
fi

# Push the image to Artifact Registry
echo ""
echo -e "${YELLOW}Pushing image to Artifact Registry...${NC}"
docker push "$IMAGE_TAG"

if [ $? -ne 0 ]; then
    echo -e "${RED}Docker push failed!${NC}"
    exit 1
fi

# Deploy to Cloud Run
echo ""
echo -e "${YELLOW}Deploying to Cloud Run with environment variables from $ENV_FILE...${NC}"
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_TAG" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --port 80 \
    --memory "$MEMORY" \
    --cpu "$CPU" \
    --timeout "$TIMEOUT" \
    --min-instances "$MIN_INSTANCES" \
    --max-instances "$MAX_INSTANCES" \
    --cpu-boost \
    --env-vars-file "$ENV_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}Deployment successful!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "${YELLOW}Getting service URL...${NC}"
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)")
    echo ""
    echo -e "${CYAN}Service URL: $SERVICE_URL${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}Deployment failed!${NC}"
    exit 1
fi
