# GCP Cloud Run Deployment Script for Inso Assistant Backend
# Usage: .\deploy-gcp.ps1 -ProjectId "your-project-id"

param(
    [string]$ProjectId = "gen-lang-client-0273900650",
    [string]$Region = "us-central1",
    [string]$ServiceName = "inso-assistant-backend",
    [string]$Memory = "8Gi",
    [string]$Cpu = "4",
    [int]$MinInstances = 1,
    [int]$MaxInstances = 4,
    [int]$Timeout = 300,
    [string]$EnvFile = "env.yaml",
    [string]$VpcConnector = "inso-vpc-connector"
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Deploying Inso Assistant to GCP Cloud Run" -ForegroundColor Cyan
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
gcloud artifacts repositories create inso-assistant-core-backend-repo `
    --repository-format=docker `
    --location=$Region `
    --description="Inso assistant core backend Docker images" 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Repository created successfully" -ForegroundColor Green
} else {
    Write-Host "Repository already exists or creation failed (continuing...)" -ForegroundColor Yellow
}

# Configure Docker authentication
Write-Host ""
Write-Host "Configuring Docker authentication..." -ForegroundColor Yellow
gcloud auth configure-docker "$Region-docker.pkg.dev"

# Build the Docker image using GCP Cloud Build with layer caching
$ImageTag = "${Region}-docker.pkg.dev/${ProjectId}/inso-assistant-core-backend-repo/${ServiceName}:latest"
Write-Host ""
Write-Host "Building Docker image via Cloud Build with caching: $ImageTag" -ForegroundColor Yellow
gcloud builds submit --config cloudbuild-build.yaml --substitutions=_IMAGE_TAG=$ImageTag .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Cloud Build failed!" -ForegroundColor Red
    exit 1
}

# Check VPC Connector
$VpcFlag = "--clear-vpc-connector"
if ($VpcConnector) {
    Write-Host "Checking VPC Connector: $VpcConnector..." -ForegroundColor Yellow
    $null = gcloud compute networks vpc-access connectors describe $VpcConnector --region=$Region --project=$ProjectId --quiet 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "VPC Connector '$VpcConnector' found. Routing traffic privately." -ForegroundColor Green
        $VpcFlag = "--vpc-connector=$VpcConnector"
    } else {
        Write-Host "VPC Connector '$VpcConnector' not found or API not enabled. Routing publicly." -ForegroundColor Yellow
    }
}

# Deploy to Cloud Run
Write-Host ""
Write-Host "Deploying to Cloud Run with environment variables from $EnvFile..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image $ImageTag `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --port 8080 `
    --memory $Memory `
    --cpu $Cpu `
    --timeout $Timeout `
    --min-instances $MinInstances `
    --max-instances $MaxInstances `
    --cpu-boost `
    --no-cpu-throttling `
    --execution-environment gen2 `
    --env-vars-file $EnvFile `
    $VpcFlag

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
