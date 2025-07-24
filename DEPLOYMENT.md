# ASON Backend - Google Cloud Run Deployment Guide

This guide will help you deploy the ASON Backend to Google Cloud Run.

## Prerequisites

Before deploying, ensure you have:

1. **Google Cloud Account** with billing enabled
2. **Google Cloud SDK** installed and configured
3. **Docker** installed and running
4. **Project with required APIs enabled**

## Step 1: Environment Setup

### 1.1 Install Google Cloud SDK

```bash
# macOS
brew install --cask google-cloud-sdk

# Windows
# Download from: https://cloud.google.com/sdk/docs/install

# Linux
curl https://sdk.cloud.google.com | bash
```

### 1.2 Authenticate with Google Cloud

```bash
gcloud auth login
gcloud auth application-default login
```

### 1.3 Create or Select a Project

```bash
# Create new project
gcloud projects create your-project-id

# Select existing project
gcloud config set project your-project-id
```

### 1.4 Enable Required APIs

```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

## Step 2: Environment Variables

Create a `.env` file in your project root (if not already exists) with the following variables:

```env
# Database
DATABASE_LOCAL=your_mongodb_connection_string

# JWT
JWT_ACCESS_TOKEN=your_jwt_access_token
JWT_ACCESS_EXPIRES_IN=7d
JWT_REFRESH_REFRESH_TOKEN=your_jwt_refresh_token
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
```

## Step 3: Deployment Options

### Option A: Using the Deploy Script (Recommended)

1. Make the script executable:
```bash
chmod +x deploy.sh
```

2. Run the deployment:
```bash
./deploy.sh
```

### Option B: Manual Deployment

1. **Build the Docker image:**
```bash
docker build -t us-central1-docker.pkg.dev/your-project-id/ason-backend-repo/ason-backend:latest .
```

2. **Push to Artifact Registry:**
```bash
# Configure Docker for Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Create repository if it doesn't exist
gcloud artifacts repositories create ason-backend-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="ASON Backend Docker repository"

# Push the image
docker push us-central1-docker.pkg.dev/your-project-id/ason-backend-repo/ason-backend:latest
```

3. **Deploy to Cloud Run:**
```bash
gcloud run deploy ason-backend-service \
    --image us-central1-docker.pkg.dev/your-project-id/ason-backend-repo/ason-backend:latest \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --port 5100 \
    --memory 2Gi \
    --cpu 1 \
    --max-instances 10 \
    --min-instances 0 \
    --timeout 300s \
    --set-env-vars NODE_ENV=production,PORT=5100
```

### Option C: Using Cloud Build (CI/CD)

1. **Trigger Cloud Build:**
```bash
gcloud builds submit --config cloudbuild.yaml
```

## Step 4: Environment Variables Setup

After deployment, you need to set environment variables:

```bash
gcloud run services update ason-backend-service \
    --region us-central1 \
    --set-env-vars "DATABASE_LOCAL=your_mongodb_connection_string" \
    --set-env-vars "JWT_ACCESS_TOKEN=your_jwt_access_token" \
    --set-env-vars "LINKUP_API_KEY=your_linkup_api_key" \
    --set-env-vars "GROQ_API_KEY=your_groq_api_key" \
    --set-env-vars "OPENAI_API_KEY=your_openai_api_key" \
    --set-env-vars "ANTHROPIC_API_KEY=your_anthropic_api_key"
```

Or set them via the Google Cloud Console:
1. Go to Cloud Run > Services
2. Click on your service
3. Click "Edit & Deploy New Revision"
4. Go to "Variables & Secrets" tab
5. Add your environment variables

## Step 5: Database Setup

### MongoDB Atlas (Recommended)

1. Create a MongoDB Atlas cluster
2. Get the connection string
3. Add your Cloud Run service IP to the IP whitelist (or use 0.0.0.0/0 for all IPs)
4. Update the `DATABASE_LOCAL` environment variable

### Self-hosted MongoDB

1. Ensure your MongoDB instance is accessible from Google Cloud
2. Configure proper firewall rules
3. Update the connection string

## Step 6: Testing the Deployment

1. **Health Check:**
```bash
curl https://your-service-url/health
```

2. **API Test:**
```bash
curl https://your-service-url/api/v1/auth/login
```

3. **View Logs:**
```bash
gcloud run logs read --service=ason-backend-service --region=us-central1
```

## Step 7: Custom Domain (Optional)

1. **Map a custom domain:**
```bash
gcloud run domain-mappings create \
    --service ason-backend-service \
    --domain api.yourdomain.com \
    --region us-central1
```

2. **Update DNS records** as instructed by Google Cloud Console

## Monitoring and Scaling

### View Metrics
```bash
# View service details
gcloud run services describe ason-backend-service --region us-central1

# View logs
gcloud run logs read --service=ason-backend-service --region=us-central1
```

### Update Service
```bash
gcloud run services update ason-backend-service \
    --region us-central1 \
    --memory 4Gi \
    --cpu 2 \
    --max-instances 20
```

## Troubleshooting

### Common Issues

1. **Port Issues:**
   - Ensure your app listens on `process.env.PORT`
   - Default port should be 5100

2. **Memory Issues:**
   - Increase memory allocation
   - Optimize your application

3. **Cold Start Issues:**
   - Set min-instances to 1
   - Optimize initialization time

4. **Database Connection Issues:**
   - Check IP whitelist in MongoDB Atlas
   - Verify connection string
   - Check firewall rules

### Debugging Commands

```bash
# View detailed logs
gcloud run logs read --service=ason-backend-service --region=us-central1 --limit=50

# Check service configuration
gcloud run services describe ason-backend-service --region=us-central1

# Test locally with Docker
docker run -p 5100:5100 us-central1-docker.pkg.dev/your-project-id/ason-backend-repo/ason-backend:latest
```

## Cost Optimization

1. **Set appropriate instance limits:**
   - `--min-instances 0` for development
   - `--max-instances 10` for production

2. **Right-size your resources:**
   - Start with 1 CPU, 2Gi memory
   - Monitor and adjust based on usage

3. **Use request-based pricing:**
   - You only pay for requests processed
   - No charges when idle

## Security Considerations

1. **Environment Variables:**
   - Store sensitive data in Secret Manager
   - Use least privilege IAM roles

2. **Authentication:**
   - Consider using `--no-allow-unauthenticated` for production
   - Implement proper API authentication

3. **HTTPS:**
   - Cloud Run automatically provides HTTPS
   - Redirect HTTP to HTTPS in your app

## Next Steps

1. Set up monitoring with Google Cloud Monitoring
2. Configure alerting for errors and high latency
3. Set up automated deployments with GitHub Actions
4. Implement proper logging and error tracking
5. Consider using Cloud SQL for production databases

For more information, visit the [Google Cloud Run documentation](https://cloud.google.com/run/docs).
