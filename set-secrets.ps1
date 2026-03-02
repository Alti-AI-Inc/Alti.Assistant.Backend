# Set GitHub Actions secrets for deployment
# Requires: gh CLI authenticated (run `gh auth login` first)
#
# Usage:
#   .\set-secrets.ps1 -GcpKeyFile "path\to\sa-key.json" -SshKeyFile "path\to\alti-vm-key"
#
# Example:
#   .\set-secrets.ps1 -GcpKeyFile "$env:USERPROFILE\.gcp\alti-sa-key.json" -SshKeyFile "$env:USERPROFILE\.ssh\alti-vm-key"

param(
    [Parameter(Mandatory = $true)]
    [string]$GcpKeyFile,

    [Parameter(Mandatory = $true)]
    [string]$SshKeyFile,

    [string]$Repo = "Alti-AI-Inc/Alti.Assistant.Backend"
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "   Setting GitHub Actions Secrets" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

# Validate files exist
if (-not (Test-Path $GcpKeyFile)) {
    Write-Host "ERROR: GCP key file not found: $GcpKeyFile" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $SshKeyFile)) {
    Write-Host "ERROR: SSH key file not found: $SshKeyFile" -ForegroundColor Red
    exit 1
}

# Check gh CLI is available
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'gh' CLI is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Install it from: https://cli.github.com/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Repo: $Repo" -ForegroundColor Cyan
Write-Host "GCP key: $GcpKeyFile" -ForegroundColor Cyan
Write-Host "SSH key: $SshKeyFile`n" -ForegroundColor Cyan

# Set GCP_SA_KEY
Write-Host "Setting GCP_SA_KEY..." -ForegroundColor Yellow
Get-Content $GcpKeyFile -Raw | gh secret set GCP_SA_KEY --repo $Repo
Write-Host "GCP_SA_KEY set successfully." -ForegroundColor Green

# Set VM_SSH_KEY
Write-Host "Setting VM_SSH_KEY..." -ForegroundColor Yellow
Get-Content $SshKeyFile -Raw | gh secret set VM_SSH_KEY --repo $Repo
Write-Host "VM_SSH_KEY set successfully." -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "All secrets set!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Magenta

Write-Host "Verify at: https://github.com/$Repo/settings/secrets/actions" -ForegroundColor Cyan
