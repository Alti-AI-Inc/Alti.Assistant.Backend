# scripts/run-scanner-background.ps1
param (
    [string]$token = $env:GITHUB_TOKEN
)

$scriptPath = Join-Path $PSScriptRoot "scan-gcp-repos.cjs"
$logPath = Join-Path $PSScriptRoot "../logs/gcp-scanner.log"
$errLogPath = Join-Path $PSScriptRoot "../logs/gcp-scanner-error.log"

# Ensure logs directory exists
$logsDir = Split-Path $logPath
if (!(Test-Path $logsDir)) {
    New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
}

Write-Host "`n======================================================"
Write-Host "Launching GCP Repository License Scanner Background Task"
Write-Host "======================================================"

if ($token) {
    Write-Host "Using GITHUB_TOKEN provided."
    Start-Process node -ArgumentList "$scriptPath", "$token" -RedirectStandardOutput $logPath -RedirectStandardError $errLogPath -WindowStyle Hidden
} else {
    Write-Host "[WARNING] No GITHUB_TOKEN provided. Launching unauthenticated..."
    Start-Process node -ArgumentList "$scriptPath" -RedirectStandardOutput $logPath -RedirectStandardError $errLogPath -WindowStyle Hidden
}

Write-Host "Background scanner successfully launched!"
Write-Host "You can track progress in real-time by viewing the log file:"
Write-Host "  Get-Content -Path '$logPath' -Wait"
Write-Host "======================================================`n"
