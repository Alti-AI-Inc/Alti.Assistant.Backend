# GCP Cloud Run Deployment Script for Alti Assistant Backend
# Usage: .\deploy-gcp.ps1 -ProjectId "your-project-id"

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId = "alti-assistant-prod",
    
    [string]$Region = "us-central1",
    [string]$ServiceName = "alti-assistant-backend",
    [string]$Memory = "4Gi",
    [string]$Cpu = "2",
    [int]$MinInstances = 1,
    [int]$MaxInstances = 4,
    [int]$Timeout = 300,
    [string]$EnvFile = "env.yaml"
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Deploying Alti Assistant to GCP Cloud Run" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if env.yaml exists
if (-not (Test-Path $EnvFile)) {
    Write-Host "Error: Environment file '$EnvFile' not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Using environment file: $EnvFile" -ForegroundColor Green
Write-Host ""

# Set the project
Write-Host "Setting GCP project to: $ProjectId" -ForegroundColor Yellow
gcloud config set project $ProjectId

# Enable required APIs
Write-Host ""
Write-Host "Enabling required GCP APIs..." -ForegroundColor Yellow
gcloud services enable artifactregistry.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com

# Create Artifact Registry repository (if it doesn't exist)
Write-Host ""
Write-Host "Creating Artifact Registry repository..." -ForegroundColor Yellow
gcloud artifacts repositories create alti-assistant-core-backend-repo `
    --repository-format=docker `
    --location=$Region `
    --description="Alti assistant core backend Docker images" 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Repository created successfully" -ForegroundColor Green
} else {
    Write-Host "Repository already exists or creation failed (continuing...)" -ForegroundColor Yellow
}

# Configure Docker authentication
Write-Host ""
Write-Host "Configuring Docker authentication..." -ForegroundColor Yellow
gcloud auth configure-docker "$Region-docker.pkg.dev"

# Build the Docker image
$ImageTag = "${Region}-docker.pkg.dev/${ProjectId}/alti-assistant-core-backend-repo/${ServiceName}:latest"
Write-Host ""
Write-Host "Building Docker image: $ImageTag" -ForegroundColor Yellow
docker build -t $ImageTag .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker build failed!" -ForegroundColor Red
    exit 1
}

# Push the image to Artifact Registry
Write-Host ""
Write-Host "Pushing image to Artifact Registry..." -ForegroundColor Yellow
docker push $ImageTag

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker push failed!" -ForegroundColor Red
    exit 1
}

# Deploy to Cloud Run
Write-Host ""
Write-Host "Deploying to Cloud Run with environment variables from $EnvFile..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image $ImageTag `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --port 80 `
    --memory $Memory `
    --cpu $Cpu `
    --timeout $Timeout `
    --min-instances $MinInstances `
    --max-instances $MaxInstances `
    --cpu-boost `
    --env-vars-file $EnvFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "Deployment successful!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Getting service URL..." -ForegroundColor Yellow
    $ServiceUrl = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"
    Write-Host ""
    Write-Host "Service URL: $ServiceUrl" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}
