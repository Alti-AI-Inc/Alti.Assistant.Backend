# Enterprise Unified Deployment Script
# Usage: .\deploy-enterprise.ps1 -ProjectId "gen-lang-client-0273900650" -Region "us-central1"

param(
    [string]$ProjectId = "gen-lang-client-0273900650",
    [string]$Region = "us-central1",
    [string]$EnvFile = "env.yaml"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Enterprise Deployment: Inso Assistant Backend + Agents" -ForegroundColor Cyan
Write-Host " Project: $ProjectId" -ForegroundColor Cyan
Write-Host " Region: $Region" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Ensure project is set
gcloud config set project $ProjectId

# Array of agent microservices
$Agents = @("search", "research", "write", "code", "image", "audio", "video")
$AgentUrls = @{}

# 1. Deploy Agents
Write-Host "`n[Phase 1] Deploying Agent Microservices..." -ForegroundColor Yellow
foreach ($Agent in $Agents) {
    $AgentName = "agent-$Agent"
    $AgentDir = "agents/$AgentName"
    $ImageName = "gcr.io/$ProjectId/$AgentName"
    
    Write-Host "`n🚀 Building and deploying $AgentName..." -ForegroundColor Yellow
    
    # Use Cloud Build inline
    $CloudBuildConfig = @"
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '$ImageName', '-f', '$AgentDir/Dockerfile', '.']
images: ['$ImageName']
"@
    $CloudBuildConfig | Out-File "cloudbuild-tmp-$AgentName.yaml"
    gcloud builds submit --config "cloudbuild-tmp-$AgentName.yaml" --project $ProjectId --timeout=30m .
    Remove-Item "cloudbuild-tmp-$AgentName.yaml"
    
    # Deploy to Cloud Run
    gcloud run deploy $AgentName `
        --image $ImageName `
        --region $Region `
        --project $ProjectId `
        --platform managed `
        --allow-unauthenticated `
        --min-instances 0 `
        --max-instances 10 `
        --cpu 1 `
        --memory 1Gi
    
    # Get the deployed URL
    $AgentUrl = gcloud run services describe $AgentName --platform managed --region $Region --format="value(status.url)"
    $AgentUrls[$AgentName] = $AgentUrl
    Write-Host "✅ $AgentName deployed successfully at $AgentUrl!" -ForegroundColor Green
}

# 2. Deploy Monolith API Gateway
Write-Host "`n[Phase 2] Deploying Core Monolith API Gateway..." -ForegroundColor Yellow

$CoreServiceName = "inso-assistant-backend"
$CoreImageTag = "${Region}-docker.pkg.dev/${ProjectId}/inso-assistant-core-backend-repo/${CoreServiceName}:latest"

Write-Host "Building Docker image via Cloud Build: $CoreImageTag" -ForegroundColor Yellow
gcloud builds submit --config cloudbuild-build.yaml --substitutions=_IMAGE_TAG=$CoreImageTag .

# Prepare env variables for the core backend
$AgentEnvVars = ""
foreach ($Key in $AgentUrls.Keys) {
    $EnvKey = "AGENT_$($Key.ToUpper().Replace('-', '_'))_URL"
    $AgentEnvVars += "^|^$EnvKey=$($AgentUrls[$Key])"
}

Write-Host "Deploying Core Backend to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $CoreServiceName `
    --image $CoreImageTag `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --port 8080 `
    --memory 8Gi `
    --cpu 4 `
    --timeout 300 `
    --min-instances 1 `
    --max-instances 4 `
    --cpu-boost `
    --no-cpu-throttling `
    --env-vars-file $EnvFile `
    --set-env-vars="NODE_ENV=production$AgentEnvVars"

Write-Host "`n🎉 Enterprise Deployment Complete!" -ForegroundColor Green
