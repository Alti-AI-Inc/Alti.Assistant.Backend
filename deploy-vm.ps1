# Deployment script for Alti Assistant Backend
param(
    [string]$Version = "v0.1.0",
    [string]$VMUser = "emondarock",
    [string]$VMHost = "104.197.53.196",
    [string]$SSHKey = "$env:USERPROFILE\.ssh\alti-vm-key",
    [string]$ComposeFile = "docker-compose.yml",
    [string]$ComposeDir = "~",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Docker registry configuration
$REGISTRY = "us-central1-docker.pkg.dev/alti-assistant-prod/alti-assistant-core-backend-repo"
$IMAGE_NAME = "alti-assistant-backend"
$IMAGE_TAG_VERSION = "${REGISTRY}/${IMAGE_NAME}:${Version}"
$IMAGE_TAG_LATEST = "${REGISTRY}/${IMAGE_NAME}:latest"

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "   Alti Assistant Deployment Script" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

Write-Host "Version: $Version" -ForegroundColor Cyan
Write-Host "VM: $VMUser@$VMHost" -ForegroundColor Cyan
Write-Host "Compose Directory: $ComposeDir" -ForegroundColor Cyan
Write-Host "Compose File: $ComposeFile" -ForegroundColor Cyan

# Step 1: Build and Push Docker Image
if (-not $SkipBuild) {
    Write-Host "`nBuilding and pushing Docker image..." -ForegroundColor Yellow
    
    try {
        docker buildx build `
            --platform linux/amd64,linux/arm64 `
            -t $IMAGE_TAG_VERSION `
            -t $IMAGE_TAG_LATEST `
            --push .
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker image built and pushed successfully!" -ForegroundColor Green
        } else {
            throw "Docker build failed with exit code $LASTEXITCODE"
        }
    } catch {
        Write-Host "ERROR: Failed to build and push Docker image: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Skipping Docker build (--SkipBuild flag set)" -ForegroundColor Cyan
}

# Step 2: SSH into VM and deploy
Write-Host "`nConnecting to VM and deploying..." -ForegroundColor Yellow

# Create deployment commands (use LF line endings for Linux)
$deployCommands = "set -e`n" +
    "echo 'Navigating to compose directory...'`n" +
    "cd $ComposeDir`n" +
    "echo 'Stopping existing containers...'`n" +
    "docker compose -f $ComposeFile down`n" +
    "echo 'Pulling latest images...'`n" +
    "docker compose -f $ComposeFile pull`n" +
    "echo 'Starting containers...'`n" +
    "docker compose -f $ComposeFile up -d`n" +
    "echo 'Checking container status...'`n" +
    "docker compose -f $ComposeFile ps`n" +
    "echo 'Deployment completed successfully!'"

try {
    # Execute deployment commands via SSH (convert to LF)
    $deployCommands -replace "`r`n", "`n" | ssh -i $SSHKey "${VMUser}@${VMHost}" "bash -s"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Deployment completed successfully!" -ForegroundColor Green
    } else {
        throw "SSH deployment failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Host "ERROR: Failed to deploy to VM: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Show logs (optional)
Write-Host "`nFetching recent logs..." -ForegroundColor Yellow
try {
    ssh -i $SSHKey "${VMUser}@${VMHost}" "cd $ComposeDir && docker compose -f $ComposeFile logs --tail=20"
} catch {
    Write-Host "WARNING: Failed to fetch logs: $_" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "Deployment workflow completed!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Magenta

Write-Host "`nUseful commands:" -ForegroundColor Cyan
Write-Host "  View logs:    ssh -i $SSHKey ${VMUser}@${VMHost} 'cd $ComposeDir && docker-compose logs -f'" -ForegroundColor Gray
Write-Host "  Check status: ssh -i $SSHKey ${VMUser}@${VMHost} 'cd $ComposeDir && docker-compose ps'" -ForegroundColor Gray
Write-Host "  Restart:      ssh -i $SSHKey ${VMUser}@${VMHost} 'cd $ComposeDir && docker-compose restart'" -ForegroundColor Gray
