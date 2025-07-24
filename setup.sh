#!/bin/bash

# ASON Backend - Google Cloud Run Setup Script
# This script helps set up the initial configuration for deployment

set -e

echo "🚀 ASON Backend - Google Cloud Run Setup"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_requirements() {
    print_status "Checking requirements..."
    
    if ! command -v gcloud &> /dev/null; then
        print_error "Google Cloud SDK is not installed. Please install it first."
        echo "Visit: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install it first."
        echo "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    print_status "Requirements check passed ✓"
}

# Get project configuration
get_project_config() {
    print_status "Setting up project configuration..."
    
    # Get project ID
    if [ -z "$PROJECT_ID" ]; then
        echo -n "Enter your Google Cloud Project ID: "
        read PROJECT_ID
    fi
    
    # Get region
    if [ -z "$REGION" ]; then
        echo -n "Enter your preferred region (default: us-central1): "
        read REGION
        REGION=${REGION:-us-central1}
    fi
    
    # Get service name
    if [ -z "$SERVICE_NAME" ]; then
        echo -n "Enter your service name (default: ason-backend-service): "
        read SERVICE_NAME
        SERVICE_NAME=${SERVICE_NAME:-ason-backend-service}
    fi
    
    export PROJECT_ID
    export REGION
    export SERVICE_NAME
    
    print_status "Project ID: $PROJECT_ID"
    print_status "Region: $REGION"
    print_status "Service Name: $SERVICE_NAME"
}

# Set up Google Cloud project
setup_gcloud() {
    print_status "Setting up Google Cloud configuration..."
    
    # Set project
    gcloud config set project $PROJECT_ID
    
    # Enable required APIs
    print_status "Enabling required APIs..."
    gcloud services enable cloudbuild.googleapis.com
    gcloud services enable run.googleapis.com
    gcloud services enable artifactregistry.googleapis.com
    
    print_status "Google Cloud setup completed ✓"
}

# Create environment file template
create_env_template() {
    print_status "Creating environment file template..."
    
    if [ ! -f ".env" ]; then
        cat > .env << EOF
# Database
DATABASE_LOCAL=mongodb+srv://username:password@cluster.mongodb.net/database

# JWT
JWT_ACCESS_TOKEN=your_jwt_access_token_here
JWT_ACCESS_EXPIRES_IN=7d
JWT_REFRESH_REFRESH_TOKEN=your_jwt_refresh_token_here
JWT_REFRESH_EXPIRES_IN=365d

# Email Configuration
email=your_email@example.com
password=your_email_password
SENDER_MAIL=your_sender_email@example.com
CLIENT_ID=your_oauth_client_id
CLIENT_SECRET=your_oauth_client_secret
REFRESH_TOKEN=your_refresh_token
ACCESS_TOKEN=your_access_token
CONFIRM_REG_EMAIL=your_confirm_email@example.com

# API Keys
LINKUP_API_KEY=your_linkup_api_key
GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Other services
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_SECRET_KEY=your_livekit_secret_key
CLOUD_STORAGE_SECRET_KEY=your_cloud_storage_secret_key
CLOUD_STORAGE_ACCESS_KEY=your_cloud_storage_access_key
CLOUD_STORAGE_BUCKET=your_cloud_storage_bucket

# Redis (if using)
REDIS_HOST=your_redis_host
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Application
NODE_ENV=production
PORT=5100
CLIENT_URL=https://your-frontend-domain.com
EOF
        
        print_status "Environment file (.env) created ✓"
        print_warning "Please update the .env file with your actual values before deploying!"
    else
        print_status "Environment file already exists ✓"
    fi
}

# Test Docker build
test_docker_build() {
    print_status "Testing Docker build..."
    
    if docker build -t test-ason-backend . > /dev/null 2>&1; then
        print_status "Docker build test passed ✓"
        docker rmi test-ason-backend > /dev/null 2>&1
    else
        print_error "Docker build failed. Please check your Dockerfile."
        exit 1
    fi
}

# Create deployment configuration
create_deployment_config() {
    print_status "Creating deployment configuration..."
    
    # Update deploy.sh with project-specific values
    if [ -f "deploy.sh" ]; then
        sed -i.bak "s/your-project-id/$PROJECT_ID/g" deploy.sh
        sed -i.bak "s/us-central1/$REGION/g" deploy.sh
        sed -i.bak "s/ason-backend-service/$SERVICE_NAME/g" deploy.sh
        rm deploy.sh.bak
        
        # Make deploy.sh executable
        chmod +x deploy.sh
        
        print_status "Deployment script configured ✓"
    fi
    
    # Update cloudbuild.yaml
    if [ -f "cloudbuild.yaml" ]; then
        sed -i.bak "s/your-project-id/$PROJECT_ID/g" cloudbuild.yaml
        sed -i.bak "s/us-central1/$REGION/g" cloudbuild.yaml
        sed -i.bak "s/ason-backend-service/$SERVICE_NAME/g" cloudbuild.yaml
        rm cloudbuild.yaml.bak
        
        print_status "Cloud Build configuration updated ✓"
    fi
}

# Main setup flow
main() {
    echo ""
    check_requirements
    echo ""
    get_project_config
    echo ""
    setup_gcloud
    echo ""
    create_env_template
    echo ""
    test_docker_build
    echo ""
    create_deployment_config
    echo ""
    
    print_status "Setup completed successfully! 🎉"
    echo ""
    echo "Next steps:"
    echo "1. Update your .env file with actual values"
    echo "2. Test your application locally: npm start"
    echo "3. Deploy to Cloud Run: ./deploy.sh"
    echo ""
    echo "For more information, see DEPLOYMENT.md"
}

# Run main function
main "$@"
