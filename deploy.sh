#!/bin/bash

# ASON Backend - Google Cloud Run Deployment Script
# This script deploys the ASON backend to Google Cloud Run

set -e

# Configuration
PROJECT_ID="gen-lang-client-0159237802"
SERVICE_NAME="ason-backend-service"
REGION="us-central1"
REPOSITORY_NAME="cloud-run-source-deploy"
IMAGE_NAME="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY_NAME/ason-backend"
# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting ASON Backend deployment to Google Cloud Run${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed${NC}"
    echo "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

# Prompt for project ID if not set
if [ "$PROJECT_ID" == "your-project-id" ]; then
    read -p "Enter your Google Cloud Project ID: " PROJECT_ID
    if [ -z "$PROJECT_ID" ]; then
        echo -e "${RED}❌ Error: Project ID is required${NC}"
        exit 1
    fi
fi

echo -e "${YELLOW}📋 Deployment Configuration:${NC}"
echo "  Project ID: $PROJECT_ID"
echo "  Service Name: $SERVICE_NAME"
echo "  Region: $REGION"
echo "  Image: $IMAGE_NAME"

# Confirm deployment
read -p "Continue with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  Deployment cancelled${NC}"
    exit 0
fi

# Set the project
echo -e "${YELLOW}🔧 Setting up Google Cloud project...${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${YELLOW}🔧 Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Create Artifact Registry repository if it doesn't exist
echo -e "${YELLOW}🔧 Setting up Artifact Registry...${NC}"
if ! gcloud artifacts repositories describe $REPOSITORY_NAME --location=$REGION &> /dev/null; then
    echo -e "${YELLOW}📦 Creating Artifact Registry repository...${NC}"
    gcloud artifacts repositories create $REPOSITORY_NAME \
        --repository-format=docker \
        --location=$REGION \
        --description="ASON Backend Docker repository"
else
    echo -e "${GREEN}✅ Artifact Registry repository already exists${NC}"
fi

# Configure Docker to use Artifact Registry
echo -e "${YELLOW}🔧 Configuring Docker for Artifact Registry...${NC}"
gcloud auth configure-docker $REGION-docker.pkg.dev

# Build and push the image
echo -e "${YELLOW}🏗️  Building Docker image...${NC}"
docker build -t $IMAGE_NAME:latest .

echo -e "${YELLOW}📤 Pushing image to Artifact Registry...${NC}"
docker push $IMAGE_NAME:latest

# Deploy to Cloud Run
echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME:latest \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port 5100 \
    --memory 2Gi \
    --cpu 1 \
    --max-instances 10 \
    --min-instances 0 \
    --timeout 300s \
    --env-vars-file env.yaml
# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 Service URL: $SERVICE_URL${NC}"
echo -e "${GREEN}🔍 Health Check: $SERVICE_URL/health${NC}"
echo -e "${GREEN}📊 API Endpoint: $SERVICE_URL/api/v1${NC}"

# Test the health endpoint
echo -e "${YELLOW}🧪 Testing health endpoint...${NC}"
if curl -f "$SERVICE_URL/health" &> /dev/null; then
    echo -e "${GREEN}✅ Health check passed!${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    echo "Check the logs: gcloud run logs read --service=$SERVICE_NAME --region=$REGION"
fi

echo -e "${GREEN}🎉 Deployment process completed!${NC}"
